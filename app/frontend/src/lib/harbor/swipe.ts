// Swipe to answer a waiting request on the phone (build list part 4): drag a
// card right to approve it or left to say no. The card follows the finger
// and glows green or red once it is far enough; letting go short of that
// springs it back. Touch only, so a mouse still clicks and selects text.
import { swipeAnswer } from './board.ts';

export interface SwipeOptions {
	on: boolean;
	onanswer: (yes: boolean) => void;
}

export function swipeCard(node: HTMLElement, opts: SwipeOptions) {
	let o = opts;
	let id: number | null = null;
	let x0 = 0;
	let y0 = 0;
	let dx = 0;
	let sideways = false;

	const paint = () => {
		node.style.setProperty('--dx', `${dx}px`);
		const a = sideways ? swipeAnswer(dx, node.offsetWidth) : null;
		if (a) node.dataset.swipe = a;
		else delete node.dataset.swipe;
		node.classList.toggle('swiping', sideways);
	};
	const reset = () => {
		id = null;
		dx = 0;
		sideways = false;
		paint();
	};

	function down(e: PointerEvent) {
		if (!o.on || e.pointerType === 'mouse' || id != null) return;
		// Buttons inside the card keep working as taps.
		if ((e.target as Element).closest('button, input, form')) return;
		id = e.pointerId;
		x0 = e.clientX;
		y0 = e.clientY;
		dx = 0;
		sideways = false;
	}
	function move(e: PointerEvent) {
		if (e.pointerId !== id) return;
		const mx = e.clientX - x0;
		const my = e.clientY - y0;
		if (!sideways) {
			// Up and down is scrolling the page; only a clear sideways move is a swipe.
			if (Math.abs(my) > 12 && Math.abs(my) > Math.abs(mx)) return reset();
			if (Math.abs(mx) < 12) return;
			sideways = true;
			node.setPointerCapture?.(e.pointerId);
		}
		dx = mx;
		paint();
	}
	function up(e: PointerEvent) {
		if (e.pointerId !== id) return;
		const a = sideways ? swipeAnswer(dx, node.offsetWidth) : null;
		if (sideways) {
			// A swipe is not a tap on the card's link.
			const stop = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); };
			node.addEventListener('click', stop, { capture: true, once: true });
			setTimeout(() => node.removeEventListener('click', stop, { capture: true }), 400);
		}
		if (a) {
			node.style.setProperty('--dx', `${(a === 'yes' ? 1 : -1) * node.offsetWidth * 1.2}px`);
			node.classList.add('gone');
			o.onanswer(a === 'yes');
			id = null;
			return;
		}
		reset();
	}

	node.addEventListener('pointerdown', down);
	node.addEventListener('pointermove', move);
	node.addEventListener('pointerup', up);
	node.addEventListener('pointercancel', reset);
	return {
		update(next: SwipeOptions) {
			o = next;
		},
		destroy() {
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointermove', move);
			node.removeEventListener('pointerup', up);
			node.removeEventListener('pointercancel', reset);
		}
	};
}
