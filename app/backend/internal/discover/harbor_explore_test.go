package discover

import "testing"

func TestSortFinish(t *testing.T) {
	out := []HarborFinish{
		{Name: "Alien", Owned: 4, Total: 7, Missing: make([]ItemView, 3)},
		{Name: "Dune", Owned: 2, Total: 3, Missing: make([]ItemView, 1)},
		{Name: "Shrek", Owned: 2, Total: 4, Missing: make([]ItemView, 2)},
		{Name: "Cars", Owned: 2, Total: 4, Missing: make([]ItemView, 2)},
	}
	sortFinish(out)
	want := []string{"Dune", "Alien", "Cars", "Shrek"}
	for i, n := range want {
		if out[i].Name != n {
			t.Fatalf("at %d: got %s, want %s", i, out[i].Name, n)
		}
	}
	if idText(int64(42)) != "42" || idText("7") != "7" || idText(nil) != "" {
		t.Fatal("idText")
	}
}
