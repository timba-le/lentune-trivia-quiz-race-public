/* ==========================================================================
   Trivia Quiz Weekly Race — screenshot validator

   Checks that an uploaded image really is a Stuff quiz result card, and reads
   the score straight out of it so a typo (or a fib) gets caught at the door.

   The quiz card always ends with the same score badge: a violet ring, the
   score in violet digits, a grey rule, and the question count underneath.
   That badge is what we look for — find the ring, then read what's inside it.

   Pure JS on raw RGBA, no dependencies: runs in the browser against canvas
   ImageData and in Node against the test fixtures.
   ========================================================================== */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QuizShotValidator = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const ACCEPT_THRESHOLD = 60;

  // Work at a fixed-ish size so thresholds behave the same for a phone
  // screenshot and a desktop one.
  const WORK_MAX_EDGE = 1000;

  const GRID_W = 10;
  const GRID_H = 16;

  // Score awarded per check. They add up to 100; anything at or above
  // ACCEPT_THRESHOLD is recognised as a genuine quiz screenshot. No single
  // check is required, so a card still passes when the ring is barely
  // coloured (a low score) or the question count is too small to read.
  const POINTS = {
    scoreDigits: 25,
    rule: 15,
    questionCount: 15,
    questionCountMatches: 20,
    ring: 15,
    scoreMatches: 10
  };

  // A glyph has to look at least this much like a digit before we believe it.
  const GLYPH_MIN_SIMILARITY = 0.72;
  const GLYPH_MIN_MARGIN = 0.03;

  /* ---------------------------------------------------------------- digits
     Coverage templates for 0-9, rendered from three bold grotesques and
     stored as one hex nibble per cell (10x16), plus the glyph aspect ratio.
     Matching is on grey coverage rather than a hard bitmap, which survives
     JPEG mush and small badges far better. */
  const TEMPLATE_DATA = {
    '0': [
      '005cffc50005effffe502cffccffc26ffa12bff6aff6006ffacfe4004efcdfe3003efdefe3003efeefe3003efedfe3003efdcfe4004efcaff6006ffa7ffa12bff62dffccffc206effffe50005cffc500|0.64',
      '016cffc61006effffe603dffdeffd27ffc33cff7bff7008ffadff5005ffcefe4004efdefe3004efeefe3004efeefe4004efddff5005ffcbff7008ffa7ffc33cff73dffeeffd306effffe60016cffc610|0.82',
      '016cffc60007effffe503effeeffc28ffd45eff5bff901bff9dff7009ffbeff6008ffceff5007ffdeff5007ffdeff6008ffcdff7009ffbbff901bff97ffd45eff63dffeeffd207effffe60016dffc610|0.81'
    ],
    '1': [
      '00001bfd0000006efd000016effd00038efffd000dffeffd000efb6efd000c823efd0001003efd0000003efd0000003efd0000003efd0000003efd0000003efd0000003efd0000003efd0000003efd00|0.45',
      '0008ffb100115dffb100bcefffb100efffffb100cddfffb100122cffb100001cffb100001cffb100001cffb100001cffb100001cffb100001cffb100001cffb100abbeffebb9effffffffdeffffffffd|0.69',
      '00002dffd000019fffd00029efffd026cfffffd0cfffffffd0dffecfffd0deb47fffd074107fffd000007fffd000007fffd000007fffd000007fffd000007fffd000007fffd000007fffd000007fffd0|0.59'
    ],
    '2': [
      '015cefd92006efffffb23dffcceff87ffa216ffc9de4002dfd1331003efc0000007ff8000005efc200004dfe500004dfe700004dfe700002cfe700001affa322226effeddddcbffffffffeeffffffffe|0.67',
      '38cefeb500affffffe60affdefffd2ac6239ffe5520003dff7000002dff6000004efe4000009ffb100005efe500003dff910003cffb20003bffb20003cffc42222dfffedddddefffffffffefffffffff|0.78',
      '017dffea3018ffffffb24effeefff88ffe64cffcaffb107ffe3565008ffd000003dffa00002bffe40002bfff80002bfff91001affe810007fff810003dffea99997fffffffffcfffffffffefffffffff|0.83'
    ],
    '3': [
      '018dfeb40019fffffd406efebdffa1afe513dfd3467101bfd3000015efa10002befc300004eff920000378efb20000007ff81220003efcbdb1004efccfe612aff96efebcffd419effffe60017dfeb500|0.66',
      '38cefed8209fffffffa19feddefff69b5224dff92100009ff8000002bfe500189cff91002dfffb20002ceefeb2000234cff90000007ffd3000007ffdd94225dffbefeddeffe6dffffffe815adefec610|0.78',
      '017dffd71008efffff804effeeffd28ffc35efe437a603dfe400014affb10001cffd400002dffe8100029bffe6000001bffb0010007ffd69b6008ffcaffc44cff94effeeffe418efffff81017dffd810|0.83'
    ],
    '4': [
      '000005ee4000002cfe4000007ffe400003dffe40001afefe40005ee9fe4002cf85fe4007fc25fe403de605fe40bfc437fe63effeeeffedeffffffffe99999bffb9000005fe40000005fe40000005fe40|0.74',
      '00002cff6000007fff600003dfff600009feff60004ed9ff6001bf77ff6006ec26ff602ce606ff608fb106ff60efc99cffc9effffffffeeffffffffe66666affa6000006ff60000006ff60000006ff60|0.88',
      '000008ff8000003dff800001afff800005efff80001bfeff80007fe9ef8003dfa4ef8019fd34ef805ef804ef80cfe758ffa5effffffffeeffffffffedffffffffe444447efa4000004ef80000004ef80|0.88'
    ],
    '5': [
      '04efffffe406ffffffe408ffedddc30afc3222211cfa1000002dfb9a94004efffffd506fffeeffd36cd734bff80120004efb1330003efcbdd2004efb9ff8129ff84efeccffd307effffe50017dfeb500|0.69',
      '8ffffffffa8ffffffffa8ffeddddd88ffa2222218ff90000008ffc9863008ffffffd718fffffffe56b867bfffb110001affe0000006ffe3100008ffdda4226dffaefeddfffd4effffffe605adffeb400|0.78',
      '07fffffff509fffffff50afffffff51cfea999932dfd2000003efd7aa6104efffffe816fffffffe55dec67effa0232009ffd0011007ffd8ac7008ffcaffd44dff85effeeffd318effffe70017dffd710|0.84'
    ],
    '6': [
      '003aefd81003cfffff911bffdbefe45efc216ee89ff6001432cfe4354100dfe9dfeb30efffffffc2effe97cff8dff8004efccff5001cfeaff6001cfd6efb215efb2cffdbefe604dfffff91004befd710|0.66',
      '0015befeb1018effffd206effeddc22dff9322417ffb100000bff7599610dffdffffa1effedefff7efe624cffcefe4005ffeefe4004efecff6005ffe8ffb219ffb3dffcbefe506effffe81016cefd710|0.80',
      '004befd81004dfffff812cffeeffe46ffe64dff8affb106752cff9144200eff9aeec50effeffffd3efffcbeff9effc219ffddff9005ffeaffa005ffd6ffd53affb2cffedffe605efffffa1005befd920|0.81'
    ],
    '7': [
      'efffffffffefffffffffdeeeeeeffb233333bfc3000005ee5000002cfa1000006fe4000001cfb1000005ef6000000afd2000002dfb1000004ef70000007ff5000000afe3000001bfd2000001cfd20000|0.67',
      'fffffffffefffffffffeddddddeffe222223bffc000004eff6000009ffc200003dff7000008ffd200002dff8000007ffe300002cff9000006ffe400001bffb100005eff500001affc100004eff700000|0.79',
      'efffffffffefffffffffefffffffff9aaaaaeff9000006ffb200002cfe5000006ffa100001cff5000005efc2000009ff9000001cff5000003efe3000005ffc1000008ffb100000affa000001bff90000|0.82'
    ],
    '8': [
      '018dffd71019ffffff815efd88dfe48ff6007ff79fe4004ff85ef8119fe419eeccee8103cffffc303cfebbefc39ff7116efadfd2002dfeefd2001dfedfe5005efd8ffd88dff819ffffffa2017dffd810|0.64',
      '016cffd92008efffffb24efebbeff88ffa117ffb8ff8004ffb6ffd617fe62cfffcde8104dffffd4017eedfffd46ef838effbbfe4005efedfe4002dffcff9105efe7fffbbeff92affffffb2028dffd920|0.83',
      '028dfec7101afffffe815effeeffe49ffc34dff69ff901bff65efd77efe31affffff8018fffffe606effbcffe4cffa12cffaeff6009ffceff7009ffdcffc45dffb8fffeeffe62bffffffa102aeffd820|0.81'
    ],
    '9': [
      '017dfeb40018effffd405efebcffc2afe612bff6dfd2005ffadfd2004efdcfe4007ffe8ffc78effe2bfffffffe03befd9efe0014533efc2341005ffa7ee712bfe64efebcffb119fffffc30018dfea300|0.66',
      '017cfec61018effffe605efebcffd3bff912bff8eff5006ffcffe4004efdeff5004efecffb427ffe7fffedeffe1affffdffc0169958ffa000002cff614223affc22dddeffe602dffffe7102cffeb5000|0.80',
      '018dfec50019fffffe505effeeffc2affb34dff7dff6009ffbdff6008ffdcff912bffe8ffebcffff2cffffefff04ceeb9ffe0024418ffd246601affb7efd45eff73dffeeffc207effffd50017dfeb500|0.81'
    ]
  };

  let templateCache = null;

  function templates() {
    if (templateCache) return templateCache;
    templateCache = [];
    for (const digit of Object.keys(TEMPLATE_DATA)) {
      for (const raw of TEMPLATE_DATA[digit]) {
        const [cells, aspect] = raw.split('|');
        const grid = new Float32Array(GRID_W * GRID_H);
        for (let i = 0; i < grid.length; i++) grid[i] = parseInt(cells[i], 16) / 15;
        templateCache.push({ digit, grid, aspect: Number(aspect) });
      }
    }
    return templateCache;
  }

  /* --------------------------------------------------------------- pixels */

  function hsvAt(data, i) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const d = mx - mn;
    let h = 0;
    if (d > 0) {
      if (mx === r) h = 60 * (((g - b) / d) % 6);
      else if (mx === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
      if (h < 0) h += 360;
    }
    return { h, s: mx === 0 ? 0 : d / mx, v: mx };
  }

  const isViolet = (p) => p.h >= 248 && p.h <= 296 && p.s >= 0.25 && p.v >= 0.38;

  /** Box-average down to WORK_MAX_EDGE so big uploads stay quick. */
  function toWorking(image) {
    const w = image.width;
    const h = image.height;
    const data = image.data;
    const longest = Math.max(w, h);
    if (longest <= WORK_MAX_EDGE) return { width: w, height: h, data };

    const scale = WORK_MAX_EDGE / longest;
    const nw = Math.max(1, Math.round(w * scale));
    const nh = Math.max(1, Math.round(h * scale));
    const out = new Uint8ClampedArray(nw * nh * 4);

    for (let y = 0; y < nh; y++) {
      const sy0 = Math.floor((y * h) / nh);
      const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * h) / nh));
      for (let x = 0; x < nw; x++) {
        const sx0 = Math.floor((x * w) / nw);
        const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * w) / nw));
        let r = 0, g = 0, b = 0, n = 0;
        for (let sy = sy0; sy < sy1; sy++) {
          for (let sx = sx0; sx < sx1; sx++) {
            const i = (sy * w + sx) * 4;
            r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
          }
        }
        const o = (y * nw + x) * 4;
        out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
      }
    }
    return { width: nw, height: nh, data: out };
  }

  /** 8-connected labelling. Returns a label per pixel plus per-blob bounds. */
  function labelComponents(mask, w, h) {
    const labels = new Int32Array(w * h).fill(-1);
    const stack = new Int32Array(w * h);
    const blobs = [];

    for (let start = 0; start < mask.length; start++) {
      if (!mask[start] || labels[start] !== -1) continue;
      const id = blobs.length;
      let sp = 0;
      stack[sp++] = start;
      labels[start] = id;
      let area = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;

      while (sp > 0) {
        const p = stack[--sp];
        const px = p % w;
        const py = (p / w) | 0;
        area++;
        if (px < x0) x0 = px;
        if (px > x1) x1 = px;
        if (py < y0) y0 = py;
        if (py > y1) y1 = py;

        for (let dy = -1; dy <= 1; dy++) {
          const ny = py + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = px + dx;
            if (nx < 0 || nx >= w) continue;
            const np = ny * w + nx;
            if (mask[np] && labels[np] === -1) {
              labels[np] = id;
              stack[sp++] = np;
            }
          }
        }
      }
      blobs.push({ id, area, x0, y0, x1, y1 });
    }
    return { labels, blobs };
  }

  /* ---------------------------------------------------------------- badge

     Every card carries the same badge: the score in violet digits, a grey rule
     under it, the question count in grey below that, all inside a ring that
     fills as you score. The ring is only *fully* violet on a perfect round —
     on a 3/15 barely a fifth of it is coloured, and on a 0 none of it is — so
     the ring is a bonus signal, never the anchor. The digits are the anchor.

     Handy constant: across every card we have, the ring's centre sits on the
     score digits' baseline and its radius is about 1.42x the digit height,
     which is enough to place the whole badge from the digits alone. */

  const BADGE_RADIUS_PER_DIGIT_HEIGHT = 1.42;

  /** Violet blobs shaped like a digit: upright, reasonably solid, not a bar. */
  function glyphBlobs(blobs, minDim) {
    const out = [];
    for (const blob of blobs) {
      const bw = blob.x1 - blob.x0 + 1;
      const bh = blob.y1 - blob.y0 + 1;
      if (bh < Math.max(7, minDim * 0.015) || bh > minDim * 0.6) continue;
      const aspect = bw / bh;
      if (aspect < 0.12 || aspect > 1.3) continue;
      const fill = blob.area / (bw * bh);
      if (fill < 0.18 || fill > 0.97) continue;
      out.push(blob);
    }
    return out;
  }

  /**
   * Group glyphs that sit side by side on a shared baseline — "15" is two
   * blobs, "3" is one. Nothing we care about is more than two digits long.
   */
  function clusterGlyphs(glyphs) {
    const sorted = glyphs.slice().sort((a, b) => a.x0 - b.x0);
    const clusters = [];

    const make = (members) => {
      const x0 = Math.min(...members.map((b) => b.x0));
      const x1 = Math.max(...members.map((b) => b.x1));
      const y0 = Math.min(...members.map((b) => b.y0));
      const y1 = Math.max(...members.map((b) => b.y1));
      return { blobs: members, x0, x1, y0, y1, width: x1 - x0 + 1, height: y1 - y0 + 1 };
    };

    for (let i = 0; i < sorted.length; i++) {
      clusters.push(make([sorted[i]]));

      const a = sorted[i];
      const ah = a.y1 - a.y0 + 1;
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j];
        const bh = b.y1 - b.y0 + 1;
        const tall = Math.max(ah, bh);
        if (Math.abs(a.y1 - b.y1) > tall * 0.3) continue; // shared baseline
        if (Math.abs(ah - bh) > tall * 0.45) continue; // similar size
        const gap = b.x0 - a.x1;
        if (gap < -tall * 0.2 || gap > tall * 0.7) continue;
        clusters.push(make([a, b]));
      }
    }
    return clusters;
  }

  /** Place the badge circle from a digit cluster. */
  function badgeFromCluster(cluster) {
    const radius = cluster.height * BADGE_RADIUS_PER_DIGIT_HEIGHT;
    return {
      cluster,
      cx: (cluster.x0 + cluster.x1) / 2,
      cy: cluster.y1,
      radius,
      diameter: radius * 2
    };
  }

  /**
   * How much of the rim is violet. A perfect round is a full circle, a low
   * score is a short arc, a zero is nothing at all — so this is scored, not
   * demanded.
   */
  function ringArcFraction(img, violet, labels, badge, ownBlobIds) {
    const w = img.width;
    const h = img.height;
    let hits = 0;
    const samples = 72;

    for (let a = 0; a < samples; a++) {
      const t = (a / samples) * Math.PI * 2;
      const cos = Math.cos(t);
      const sin = Math.sin(t);
      for (const rr of [0.88, 0.94, 1, 1.06]) {
        const x = Math.round(badge.cx + cos * badge.radius * rr);
        const y = Math.round(badge.cy + sin * badge.radius * rr);
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const p = y * w + x;
        if (violet[p] && !ownBlobIds.has(labels[p])) { hits++; break; }
      }
    }
    return hits / samples;
  }

  /**
   * Everything under the rule is grey rather than violet, and the badge is
   * translucent, so "grey" is judged against the badge's own brightness
   * instead of a fixed threshold.
   */
  function greyInkInBadge(img, badge) {
    const { cx, cy, radius } = badge;
    const w = img.width;
    const data = img.data;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(w - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(img.height - 1, Math.ceil(cy + radius));

    const inner = radius * 0.82;
    const values = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (Math.hypot(x - cx, y - cy) > inner) continue;
        const p = hsvAt(data, (y * w + x) * 4);
        if (!isViolet(p)) values.push(p.v);
      }
    }
    if (values.length < 40) return { mask: null };

    values.sort((a, b) => a - b);
    const median = values[Math.floor(values.length / 2)];
    const cutoff = median - 0.1;

    const mask = new Uint8Array(w * img.height);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (Math.hypot(x - cx, y - cy) > inner) continue;
        const p = hsvAt(data, (y * w + x) * 4);
        if (!isViolet(p) && p.s < 0.35 && p.v < cutoff) mask[y * w + x] = 1;
      }
    }
    return { mask, median };
  }

  /* ------------------------------------------------------------------ ocr */

  function glyphGrid(labels, w, id, blob) {
    const bw = blob.x1 - blob.x0 + 1;
    const bh = blob.y1 - blob.y0 + 1;
    const tw = Math.max(1, Math.min(GRID_W, Math.round((GRID_H / bh) * bw)));
    const offx = Math.floor((GRID_W - tw) / 2);

    const hits = new Float32Array(GRID_W * GRID_H);
    const seen = new Float32Array(GRID_W * GRID_H);

    for (let y = 0; y < bh; y++) {
      const gy = Math.min(GRID_H - 1, Math.floor((y / bh) * GRID_H));
      for (let x = 0; x < bw; x++) {
        const gx = Math.min(tw - 1, Math.floor((x / bw) * tw)) + offx;
        const k = gy * GRID_W + gx;
        seen[k]++;
        if (labels[(blob.y0 + y) * w + (blob.x0 + x)] === id) hits[k]++;
      }
    }

    const grid = new Float32Array(GRID_W * GRID_H);
    for (let k = 0; k < grid.length; k++) grid[k] = seen[k] ? hits[k] / seen[k] : 0;
    return { grid, aspect: bw / bh };
  }

  function classifyGlyph(glyph) {
    const perDigit = new Map();
    for (const t of templates()) {
      let diff = 0;
      for (let k = 0; k < glyph.grid.length; k++) diff += Math.abs(glyph.grid[k] - t.grid[k]);
      diff /= glyph.grid.length;
      const shape = 1 - diff;
      const shapeAspect = Math.max(0, 1 - Math.abs(glyph.aspect - t.aspect) * 1.2);
      const score = 0.88 * shape + 0.12 * shapeAspect;
      if (!perDigit.has(t.digit) || score > perDigit.get(t.digit)) perDigit.set(t.digit, score);
    }

    const ranked = Array.from(perDigit.entries()).sort((a, b) => b[1] - a[1]);
    return {
      digit: ranked[0][0],
      score: ranked[0][1],
      margin: ranked[0][1] - (ranked[1] ? ranked[1][1] : 0)
    };
  }

  /** Read a left-to-right run of glyphs as one number. */
  function readNumber(labels, w, blobs) {
    if (!blobs.length || blobs.length > 2) return null;
    let text = '';
    let weakest = 1;
    let tightest = 1;

    for (const blob of blobs) {
      const result = classifyGlyph(glyphGrid(labels, w, blob.id, blob));
      if (result.score < GLYPH_MIN_SIMILARITY) return null;
      text += result.digit;
      weakest = Math.min(weakest, result.score);
      tightest = Math.min(tightest, result.margin);
    }

    return {
      value: parseInt(text, 10),
      similarity: weakest,
      margin: tightest,
      confident: weakest >= GLYPH_MIN_SIMILARITY && tightest >= GLYPH_MIN_MARGIN
    };
  }

  /* ------------------------------------------------------------- validate */

  /**
   * @param {{data: Uint8ClampedArray, width: number, height: number}} image
   * @param {{expectedScore?: number, maxScore?: number}} [options]
   */
  /** Weigh up one candidate digit cluster as the score in a badge. */
  function evaluateCluster(img, violet, labels, cluster, maxScore, expectedScore) {
    const badge = badgeFromCluster(cluster);
    const checks = {
      scoreDigits: true,
      rule: false,
      questionCount: false,
      questionCountMatches: false,
      ring: false,
      scoreMatches: false
    };

    const ownBlobIds = new Set(cluster.blobs.map((b) => b.id));
    const arc = ringArcFraction(img, violet, labels, badge, ownBlobIds);
    // One coloured segment out of fifteen is only ~24 degrees of rim, so the
    // bar has to sit low enough that a 1/15 still counts.
    if (arc >= 0.04) checks.ring = true;

    let readTotal = null;
    const grey = greyInkInBadge(img, badge);
    if (grey.mask) {
      const greyParts = labelComponents(grey.mask, img.width, img.height);
      const minInk = Math.max(4, Math.round(badge.diameter * badge.diameter * 0.0012));
      const countBlobs = [];

      for (const blob of greyParts.blobs) {
        if (blob.area < minInk) continue;
        const bw = blob.x1 - blob.x0 + 1;
        const bh = blob.y1 - blob.y0 + 1;
        const my = (blob.y0 + blob.y1) / 2;

        // The rule: a long flat blob sitting on the digits' baseline.
        if (
          bw >= badge.diameter * 0.25 &&
          bw / bh >= 4 &&
          my >= badge.cy - badge.radius * 0.2 &&
          my <= badge.cy + badge.radius * 0.45
        ) {
          checks.rule = true;
          continue;
        }
        // The question count: smaller digits below the rule.
        if (
          my > badge.cy + badge.radius * 0.1 &&
          bh >= badge.diameter * 0.08 &&
          bh <= badge.diameter * 0.35
        ) {
          countBlobs.push(blob);
        }
      }

      countBlobs.sort((a, b) => a.x0 - b.x0);
      if (countBlobs.length) checks.questionCount = true;

      readTotal = readNumber(greyParts.labels, img.width, countBlobs);
      if (readTotal && readTotal.value === maxScore) checks.questionCountMatches = true;
    }

    const readScore = readNumber(labels, img.width, cluster.blobs.slice().sort((a, b) => a.x0 - b.x0));
    if (readScore && expectedScore !== null && readScore.value === expectedScore) {
      checks.scoreMatches = true;
    }

    let confidence = 0;
    for (const key of Object.keys(POINTS)) {
      if (checks[key]) confidence += POINTS[key];
    }

    return {
      badge,
      checks,
      confidence,
      // What the picture alone says, ignoring the typed score. Picking the
      // badge on evidence that includes the typed number would let a stray
      // glyph that happens to match beat the real digits — "1" out of "15".
      detection: confidence - (checks.scoreMatches ? POINTS.scoreMatches : 0),
      arc,
      readScore,
      readTotal
    };
  }

  /** Prefer the strongest badge; on a tie, the longer, larger number. */
  function betterCandidate(a, b) {
    if (!a) return true;
    if (b.detection !== a.detection) return b.detection > a.detection;
    if (b.badge.cluster.blobs.length !== a.badge.cluster.blobs.length) {
      return b.badge.cluster.blobs.length > a.badge.cluster.blobs.length;
    }
    return b.badge.cluster.height > a.badge.cluster.height;
  }

  /**
   * @param {{data: Uint8ClampedArray, width: number, height: number}} image
   * @param {{expectedScore?: number, maxScore?: number}} [options]
   */
  function validate(image, options) {
    const opts = options || {};
    const maxScore = Number.isFinite(opts.maxScore) ? opts.maxScore : 15;
    const expectedScore = Number.isInteger(opts.expectedScore) ? opts.expectedScore : null;

    const img = toWorking(image);
    const minDim = Math.min(img.width, img.height);
    const total = img.width * img.height;
    const violet = new Uint8Array(total);
    for (let i = 0; i < total; i++) {
      if (isViolet(hsvAt(img.data, i * 4))) violet[i] = 1;
    }

    const { labels, blobs } = labelComponents(violet, img.width, img.height);
    const clusters = clusterGlyphs(glyphBlobs(blobs, minDim));

    let best = null;
    for (const cluster of clusters) {
      const attempt = evaluateCluster(img, violet, labels, cluster, maxScore, expectedScore);
      if (betterCandidate(best, attempt)) best = attempt;
    }

    const result = {
      accepted: false,
      confidence: best ? best.confidence : 0,
      threshold: ACCEPT_THRESHOLD,
      checks: best
        ? best.checks
        : {
            scoreDigits: false,
            rule: false,
            questionCount: false,
            questionCountMatches: false,
            ring: false,
            scoreMatches: false
          },
      readScore: best && best.readScore ? best.readScore.value : null,
      readTotal: best && best.readTotal ? best.readTotal.value : null,
      readCertain: !!(best && best.readScore && best.readScore.confident),
      mismatch: false,
      reason: ''
    };

    // A number that disagrees with what was typed is worth pointing out, but
    // never worth blocking: everyone on a playing team logs the team's score
    // under their own name, so their screenshot often shows something else.
    if (
      expectedScore !== null &&
      best &&
      best.readScore &&
      best.readScore.confident &&
      best.readScore.value !== expectedScore &&
      best.readScore.value <= maxScore
    ) {
      result.mismatch = true;
    }

    result.accepted = result.confidence >= ACCEPT_THRESHOLD;

    if (!result.accepted) {
      result.reason =
        "We couldn't make out a quiz score circle in that image, so it'll be checked by hand. Send it through if you're sure it's the right screenshot.";
    } else if (result.mismatch) {
      result.reason = `Screenshot checks out. It reads ${result.readScore}, and you entered ${expectedScore} — fine if you're logging the team's score, worth a second look otherwise.`;
    } else {
      result.reason = 'Screenshot checks out.';
    }
    return result;
  }

  /** Browser convenience wrapper: data URL in, verdict out. */
  function validateDataUrl(dataUrl, options) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file doesn't look like an image."));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        try {
          resolve(validate(ctx.getImageData(0, 0, canvas.width, canvas.height), options));
        } catch (err) {
          reject(err);
        }
      };
      img.src = dataUrl;
    });
  }

  return { validate, validateDataUrl, ACCEPT_THRESHOLD, POINTS };
});
