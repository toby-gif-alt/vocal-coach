// Cache measurements, not gains: a decoded buffer may belong to several packs.
const levels = new WeakMap();
const SILENCE_RMS = 0.001; // -60 dBFS; never use silence/noise as a reference.
const MIN_GAIN = 10 ** (-12 / 20);

function percentile(sorted, fraction) {
  return sorted[Math.floor((sorted.length - 1) * fraction)];
}

function filterSample(coefficients) {
  const [b0, b1, b2, a1, a2] = coefficients;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

// BS.1770 K-weighting, with sample-rate-adjusted De Man coefficients:
// https://github.com/csteinmetz1/pyloudnorm/blob/master/pyloudnorm/iirfilter.py
// This is a sustained-note comparison, not an integrated LUFS meter.
function weightingFilters(rate) {
  const shelfK = Math.tan(Math.PI * 1681.9744509555319 / rate);
  const shelfQ = 0.7071752369554193;
  const high = 10 ** (3.99984385397 / 20);
  const middle = high ** 0.499666774155;
  const shelfDen = 1 + shelfK / shelfQ + shelfK ** 2;
  const shelf = filterSample([
    (high + middle * shelfK / shelfQ + shelfK ** 2) / shelfDen,
    2 * (shelfK ** 2 - high) / shelfDen,
    (high - middle * shelfK / shelfQ + shelfK ** 2) / shelfDen,
    2 * (shelfK ** 2 - 1) / shelfDen,
    (1 - shelfK / shelfQ + shelfK ** 2) / shelfDen,
  ]);
  const passK = Math.tan(Math.PI * 38.13547087613982 / rate);
  const passQ = 0.5003270373253953;
  const passDen = 1 + passK / passQ + passK ** 2;
  const highPass = filterSample([1, -2, 1,
    2 * (passK ** 2 - 1) / passDen,
    (1 - passK / passQ + passK ** 2) / passDen,
  ]);
  return (x) => highPass(shelf(x));
}

export function measureSampleLevel(buffer) {
  if (!buffer || typeof buffer !== "object") return null;
  if (levels.has(buffer)) return levels.get(buffer);
  let level = null;
  if (buffer.numberOfChannels > 0 && buffer.sampleRate >= 8000 && buffer.length > 0) {
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel));
    const filters = channels.map(() => weightingFilters(buffer.sampleRate));
    const windowSize = Math.max(1, Math.round(buffer.sampleRate * 0.05));
    const windows = [];
    for (let start = 0; start < buffer.length; start += windowSize) {
      const end = Math.min(buffer.length, start + windowSize);
      let energy = 0;
      for (let channel = 0; channel < channels.length; channel += 1) {
        for (let i = start; i < end; i += 1) energy += filters[channel](channels[channel][i]) ** 2;
      }
      const rms = Math.sqrt(energy / ((end - start) * channels.length));
      if (!Number.isFinite(rms)) {
        levels.set(buffer, null);
        return null;
      }
      windows.push(rms);
    }
    windows.sort((a, b) => a - b);
    // Exclude silence and quiet tails before measuring the sustained voice.
    const gate = Math.max(SILENCE_RMS, windows.at(-1) * 0.1);
    const active = windows.filter((rms) => rms > gate);
    if (active.length) level = percentile(active, 0.75);
  }
  levels.set(buffer, level);
  return level;
}

export function sampleLevelGains(buffers) {
  const measured = buffers.map(measureSampleLevel);
  const usable = measured.filter((level) => level !== null).sort((a, b) => a - b);
  // The quieter decile avoids one unusually quiet recording dragging down a
  // large pack. Only attenuate, by at most 12 dB; never boost recording noise.
  const reference = usable.length ? percentile(usable, 0.1) : null;
  return measured.map((level) => level === null || reference === null
    ? 1
    : Math.max(MIN_GAIN, Math.min(1, reference / level)));
}
