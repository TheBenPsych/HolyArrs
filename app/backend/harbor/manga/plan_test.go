package manga

import (
	"fmt"
	"strings"
	"testing"
)

func raw(name string, size int64, source string) File {
	return File{Path: "/raw/" + source + "/" + name + ".cbz", Source: source, Size: size, Raw: ParseRaw(name)}
}

func TestParseRaw(t *testing.T) {
	for _, c := range []struct{ in, group, num, title string }{
		{"unofficial_Ch. 1", "unofficial", "1", ""},
		{"unofficial_Ch. 10.2", "unofficial", "10.2", ""},
		{"unofficial_Ch. 4.5", "unofficial", "4.5", ""},
		{"unofficial_Ch. 0 - please delete", "unofficial", "0", "please delete"},
		{"Chapter 12 - The Long Night", "", "12", "The Long Night"},
		{"Some Group_Vol. 3 Ch. 21", "Some Group", "21", ""},
		{"Official_Chapter 7: Arrival", "Official", "7", "Arrival"},
		{"Vol. 2 Chapter 9.50", "", "9.5", ""},
		{"Episode 33", "", "33", ""},
		{"105", "", "105", ""},
	} {
		r := ParseRaw(c.in)
		if r.Group != c.group || !r.HasNum || r.Number.String() != c.num || r.Title != c.title {
			t.Errorf("ParseRaw(%q) = group %q number %q (has %v) title %q; want %q %q %q", c.in, r.Group, r.Number, r.HasNum, r.Title, c.group, c.num, c.title)
		}
	}
}

// The series from the first trial on Tower: a notice as chapter 0, a real
// half chapter (4.5), and chapter 10 kept three times (10, 10.1, 10.2).
func TestPlanTrialSeries(t *testing.T) {
	names := []string{"unofficial_Ch. 0 - please delete", "unofficial_Ch. 4.5", "unofficial_Ch. 10.1", "unofficial_Ch. 10.2"}
	for i := 1; i <= 22; i++ {
		names = append(names, fmt.Sprintf("unofficial_Ch. %d", i))
	}
	var files []File
	for _, n := range names {
		files = append(files, raw(n, 5_000_000, "MangaFire"))
	}
	p := MakePlan("The Eminence in Shadow", files, DefaultRules())
	if len(p.Kept) != 23 {
		t.Fatalf("kept %d chapters, want 23 (1 to 22 and 4.5)", len(p.Kept))
	}
	var got []string
	for _, k := range p.Kept {
		got = append(got, k.Name)
	}
	want := []string{"The Eminence in Shadow - Chapter 001.cbz", "The Eminence in Shadow - Chapter 002.cbz", "The Eminence in Shadow - Chapter 003.cbz",
		"The Eminence in Shadow - Chapter 004.cbz", "The Eminence in Shadow - Chapter 004.5.cbz", "The Eminence in Shadow - Chapter 005.cbz"}
	if strings.Join(got[:6], "|") != strings.Join(want, "|") {
		t.Errorf("first names = %v", got[:6])
	}
	if got[10] != "The Eminence in Shadow - Chapter 010.cbz" || got[11] != "The Eminence in Shadow - Chapter 011.cbz" {
		t.Errorf("around chapter 10: %v", got[9:12])
	}
	why := map[string]string{}
	for _, d := range p.Dropped {
		why[d.File.Raw.Number.String()] = d.Why
	}
	if len(p.Dropped) != 3 || !strings.Contains(why["0"], "notice") || !strings.Contains(why["10.1"], "part of chapter 10") || !strings.Contains(why["10.2"], "part of chapter 10") {
		t.Errorf("dropped = %v", why)
	}
}

func TestPartsStayWithoutTheWholeChapter(t *testing.T) {
	p := MakePlan("S", []File{raw("Ch. 9", 1, "A"), raw("Ch. 10.1", 1, "A"), raw("Ch. 10.2", 1, "A"), raw("Ch. 11", 1, "A")}, DefaultRules())
	if len(p.Kept) != 4 || len(p.Dropped) != 0 {
		t.Fatalf("kept %d dropped %d, want 4 and 0", len(p.Kept), len(p.Dropped))
	}
	if p.Kept[1].Name != "S - Chapter 010.1.cbz" {
		t.Errorf("name = %q", p.Kept[1].Name)
	}
}

func TestOfficialFirstUnlessWorsePictures(t *testing.T) {
	rules := DefaultRules()
	rules.Favourites = []string{"Good Group"}
	// Official and big enough: official wins over a favourite.
	p := MakePlan("S", []File{raw("Good Group_Ch. 1", 10_000, "MangaDex"), raw("Ch. 1", 7_000, "MANGA Plus by SHUEISHA")}, rules)
	if !p.Kept[0].Official || p.Kept[0].File.Source != "MANGA Plus by SHUEISHA" {
		t.Errorf("want the official copy, got %+v", p.Kept[0].File)
	}
	// Official but much smaller pictures: the fan copy wins.
	p = MakePlan("S", []File{raw("Good Group_Ch. 1", 10_000, "MangaDex"), raw("Ch. 1", 3_000, "MANGA Plus by SHUEISHA")}, rules)
	if p.Kept[0].Official {
		t.Errorf("want the fan copy when official is under 60%% of its size")
	}
	// Among fans: the favourite beats a bigger file; "unofficial" is not official.
	p = MakePlan("S", []File{raw("Good Group_Ch. 2", 5_000, "MangaDex"), raw("unofficial_Ch. 2", 9_000, "MangaFire")}, rules)
	if p.Kept[0].File.Raw.Group != "Good Group" || p.Kept[0].Official {
		t.Errorf("want the favourite group, got %+v", p.Kept[0].File)
	}
	if len(p.Dropped) != 1 || !strings.Contains(p.Dropped[0].Why, "second copy of chapter 2") {
		t.Errorf("dropped = %+v", p.Dropped)
	}
}

func TestVolumes(t *testing.T) {
	v := ParseRaw("unofficial_Ch. 0 - Volume 21")
	if !v.IsVolume || v.Volume != 21 {
		t.Fatalf("site volume entry: %+v", v)
	}
	if c := ParseRaw("unofficial_Vol. 3 Ch. 12"); c.IsVolume || c.Number.Whole != 12 {
		t.Fatalf("volume and chapter together is a chapter: %+v", c)
	}
	if c := ParseRaw("Ch. 12 v2"); c.IsVolume || c.Number.Whole != 12 {
		t.Fatalf("a second version is a chapter: %+v", c)
	}
	for name, want := range map[string]int{"My Title v03 (2019) (Digital) [grp]": 3, "My_Title_Vol.07": 7, "My Title - Volume 12": 12} {
		if o := ParseOwned(name, "My Title"); !o.IsVolume || o.Volume != want {
			t.Fatalf("%q: %+v", name, o)
		}
	}
	if o := ParseOwned("My Title - c012 [grp]", "My Title"); o.IsVolume || o.Number.Whole != 12 {
		t.Fatalf("owned chapter: %+v", o)
	}
	if o := ParseOwned("My Title 2 - Chapter 5", "My Title 2"); o.Number.Whole != 5 {
		t.Fatalf("title with a number: %+v", o)
	}

	f := func(path, source string, r Raw) File { return File{Path: path, Source: source, Size: 100, Raw: r} }
	// Beside single chapters, whole volumes are left out.
	p := MakePlan("X", []File{f("a", "S", ParseRaw("Ch. 1")), f("b", "S", ParseRaw("Ch. 0 - Volume 21")), f("c", "S", ParseRaw("Ch. 0 - Volume 22"))}, DefaultRules())
	if len(p.Kept) != 1 || len(p.Dropped) != 2 || p.Kept[0].Volume {
		t.Fatalf("mixed: kept %+v dropped %+v", p.Kept, p.Dropped)
	}
	// A title with only volumes is shelved by volume, the owner's file first.
	big := f("d", "S", ParseRaw("Ch. 0 - Volume 2"))
	big.Size = 900
	p = MakePlan("X", []File{f("e", OwnedSource, ParseOwned("X v02", "X")), big, f("g", OwnedSource, ParseOwned("X v01", "X"))}, DefaultRules())
	if len(p.Kept) != 2 || p.Kept[0].Name != "X - Volume 01.cbz" || p.Kept[1].File.Path != "e" || !p.Kept[1].Volume || len(p.Dropped) != 1 {
		t.Fatalf("volumes only: kept %+v dropped %+v", p.Kept, p.Dropped)
	}
}
