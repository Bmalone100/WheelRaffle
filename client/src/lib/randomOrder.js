// Deterministic PRNG so a shuffled order stays in sync between independent
// computations (e.g. picking a landing position vs. drawing the visual)
// without either side needing to share live state — same items in, same
// shuffle out.
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let t = seed;
  return function () {
    t |= 0;
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle(items, keyFn) {
  // A plain slice, not a per-item clone: this only permutes order, and
  // items can themselves be arrays (arrangeSpreadOut shuffles groups of
  // tickets), which `{ ...item }` would silently turn into a non-iterable
  // object.
  const arr = items.slice();
  const seed = hashString(
    arr
      .map(keyFn)
      .sort()
      .join('|')
  );
  const rand = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// If the arranged list will be tiled end-to-end (a scrolling reel repeating
// itself), the wrap-around seam — last item next to the next copy's first
// item — needs the same no-adjacent-repeat treatment as the rest of the
// list, or two of the same could still end up next to each other right at
// that join. Mutates and returns `arranged`.
function fixWrapSeam(arranged, keyFn) {
  const n = arranged.length;
  if (n < 2 || keyFn(arranged[0]) !== keyFn(arranged[n - 1])) return arranged;

  for (let j = 1; j < n; j++) {
    const candidate = arranged[j];
    const movingOut = arranged[0];
    const okAtStart = keyFn(candidate) !== keyFn(arranged[n - 1]) && keyFn(candidate) !== keyFn(arranged[1]);
    const prev = arranged[j - 1];
    const next = j + 1 < n ? arranged[j + 1] : undefined;
    const okAtJ = (!prev || keyFn(movingOut) !== keyFn(prev)) && (!next || keyFn(movingOut) !== keyFn(next));
    if (okAtStart && okAtJ) {
      [arranged[0], arranged[j]] = [arranged[j], arranged[0]];
      break;
    }
  }
  return arranged;
}

// Shuffles items into an order where no two adjacent entries share the same
// groupFn value, whenever that's mathematically possible — e.g. a name
// reel where someone's several tickets are scattered through the list
// instead of occasionally landing back-to-back ("Brian Malone" twice in a
// row reads as a glitch to anyone who doesn't know it's just two tickets).
// If one group holds more than half the items, perfect separation can't
// exist (pigeonhole), so that group gets spread out as evenly as the math
// allows and the leftover clumping is unavoidable, not a bug.
export function arrangeSpreadOut(items, keyFn) {
  const n = items.length;
  if (n < 2) return items.slice();

  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  // Randomize which same-size group goes first (Array.sort is stable, so a
  // pre-shuffle survives the size sort below), seeded so it's reproducible
  // for a given item set rather than different on every render.
  const groupList = seededShuffle([...groups.values()], (g) => keyFn(g[0]));
  groupList.sort((a, b) => b.length - a.length);

  // Interleaved slot order (0, 2, 4, ..., 1, 3, 5, ...) so filling groups
  // largest-first naturally spaces out the most repeated name the most.
  const slots = [];
  for (let i = 0; i < n; i += 2) slots.push(i);
  for (let i = 1; i < n; i += 2) slots.push(i);

  const arranged = new Array(n);
  let slotIndex = 0;
  for (const group of groupList) {
    for (const item of group) {
      arranged[slots[slotIndex]] = item;
      slotIndex++;
    }
  }

  return fixWrapSeam(arranged, keyFn);
}
