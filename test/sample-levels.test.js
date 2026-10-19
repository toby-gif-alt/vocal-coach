import assert from 'node:assert/strict';
import { test } from 'node:test';
import { measureSampleLevel, sampleLevelGains } from '../src/sample-levels.js';

function recording({ amplitude = 0.1, frequency = 440, rate = 48000, lead = 0, tail = 0, stereo = false } = {}) {
  const data = new Float32Array(Math.round((lead + 1 + tail) * rate));
  for (let i = 0; i < rate; i += 1) data[Math.round(lead * rate) + i] = amplitude * Math.sin(2 * Math.PI * frequency * i / rate);
  const channels = stereo ? [data, Float32Array.from(data, (value) => -value)] : [data];
  return { numberOfChannels: channels.length, sampleRate: rate, length: data.length, duration: data.length / rate,
    getChannelData: (channel) => channels[channel] };
}

const near = (actual, expected, tolerance = 0.005) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);

test('a sample recorded 6 dB louder receives half gain without editing either buffer', () => {
  const quiet = recording();
  const loud = recording({ amplitude: 0.2 });
  const original = loud.getChannelData(0).slice();
  const gains = sampleLevelGains([quiet, loud]);
  near(gains[0], 1);
  near(gains[1], 0.5);
  near(measureSampleLevel(loud) * gains[1], measureSampleLevel(quiet));
  assert.deepEqual(loud.getChannelData(0), original);
});

test('leading silence, release tails, stereo phase and sample rate do not skew the reference', () => {
  const plain = recording();
  const padded = recording({ lead: 1, tail: 4, stereo: true });
  near(measureSampleLevel(padded), measureSampleLevel(plain), 0.001);
  near(measureSampleLevel(recording({ rate: 44100 })), measureSampleLevel(plain), 0.001);
});

test('frequency weighting includes brighter voices rather than matching only raw peaks', () => {
  const low = measureSampleLevel(recording({ frequency: 1000 }));
  const high = measureSampleLevel(recording({ frequency: 4000 }));
  assert.ok(high > low * 1.25);
  // A known 1 kHz K-weighting response: approximately +0.7 dB.
  near(low, 0.1 / Math.sqrt(2) * 10 ** (0.7 / 20), 0.001);
});

test('silence, near silence, invalid data and unmeasurable buffers remain neutral', () => {
  const invalid = recording();
  invalid.getChannelData(0)[100] = NaN;
  const buffers = [null, { duration: 2 }, recording({ amplitude: 0 }), recording({ amplitude: 0.00001 }), invalid];
  assert.deepEqual(buffers.map(measureSampleLevel), buffers.map(() => null));
  assert.deepEqual(sampleLevelGains(buffers), buffers.map(() => 1));
  assert.deepEqual(sampleLevelGains([]), []);
});

test('calibration never amplifies and limits attenuation to 12 dB', () => {
  const gains = sampleLevelGains([recording({ amplitude: 0.01 }), recording({ amplitude: 1 })]);
  assert.equal(gains[0], 1);
  near(gains[1], 10 ** (-12 / 20));
  assert.equal(sampleLevelGains([recording()])[0], 1);
});

test('one quiet outlier does not set the reference for a full bank', () => {
  const buffers = [recording({ amplitude: 0.005 }), ...Array.from({ length: 10 }, () => recording({ amplitude: 0.1 })), recording({ amplitude: 0.2 })];
  const gains = sampleLevelGains(buffers);
  near(gains[0], 1);
  near(gains[1], 1);
  near(gains.at(-1), 0.5);
});

test('shared buffer measurements are reused while pack gains remain independent', () => {
  const shared = recording({ amplitude: 0.2 });
  const read = shared.getChannelData;
  let reads = 0;
  shared.getChannelData = (channel) => { reads += 1; return read(channel); };
  near(sampleLevelGains([recording(), shared])[1], 0.5);
  assert.equal(sampleLevelGains([shared])[0], 1);
  assert.equal(reads, 1);
});
