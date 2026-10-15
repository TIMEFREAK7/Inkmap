import { describe, expect, it } from 'vitest';
import { parseTimeline } from '../src/timeline.js';

describe('Google Maps Timeline import', () => {
  it('reads the Android on-device export, one point per day of a stay', () => {
    const r = parseTimeline(JSON.stringify({
      semanticSegments: [
        { startTime: '2024-05-01T10:00:00.000+05:30', endTime: '2024-05-03T09:00:00.000+05:30', visit: { topCandidate: { placeLocation: { latLng: '48.8584°, 2.2945°' } } } },
        { startTime: '2024-05-03T09:00:00.000+05:30', endTime: '2024-05-03T10:00:00.000+05:30', activity: { distanceMeters: 1200 } },
        { startTime: '2024-05-04T09:00:00.000+05:30', timelinePath: [{ point: '1°, 2°' }] },
      ],
      rawSignals: [], userLocationProfile: {},
    }));
    expect(r.points).toEqual([
      { lat: 48.8584, lon: 2.2945, day: '2024-05-01' },
      { lat: 48.8584, lon: 2.2945, day: '2024-05-02' },
      { lat: 48.8584, lon: 2.2945, day: '2024-05-03' },
    ]);
  });
  it('reads negative coordinates', () => {
    const r = parseTimeline(JSON.stringify({ semanticSegments: [{ startTime: '2023-01-02T10:00:00-03:00', visit: { topCandidate: { placeLocation: { latLng: '-22.9068°, -43.1729°' } } } }] }));
    expect(r.points).toEqual([{ lat: -22.9068, lon: -43.1729, day: '2023-01-02' }]);
  });
  it('reads the iPhone export', () => {
    const r = parseTimeline(JSON.stringify([{ startTime: '2022-04-03T18:00:00.000+09:00', endTime: '2022-04-03T20:00:00.000+09:00', visit: { topCandidate: { placeLocation: 'geo:35.689500,139.691700' } } }]));
    expect(r.points).toEqual([{ lat: 35.6895, lon: 139.6917, day: '2022-04-03' }]);
  });
  it('reads older Takeout monthly files', () => {
    const r = parseTimeline(JSON.stringify({ timelineObjects: [
      { placeVisit: { location: { latitudeE7: 285196000, longitudeE7: 772315000 }, duration: { startTimestamp: '2019-12-25T09:00:00Z', endTimestamp: '2019-12-25T18:00:00Z' } } },
      { activitySegment: {} },
    ] }));
    expect(r.points).toEqual([{ lat: 28.5196, lon: 77.2315, day: '2019-12-25' }]);
  });
  it('skips broken entries but keeps the rest', () => {
    const r = parseTimeline(JSON.stringify({ semanticSegments: [{ visit: {} }, { startTime: 'x', visit: { topCandidate: { placeLocation: { latLng: '1°, 2°' } } } },
      { startTime: '2024-01-01T00:00:00Z', visit: { topCandidate: { placeLocation: { latLng: '95°, 2°' } } } },
      { startTime: '2024-01-01T00:00:00Z', visit: { topCandidate: { placeLocation: { latLng: '10°, 20°' } } } }] }));
    expect(r.points).toEqual([{ lat: 10, lon: 20, day: '2024-01-01' }]);
  });
  it('caps a very long stay', () => {
    const r = parseTimeline(JSON.stringify({ semanticSegments: [{ startTime: '2020-01-01T00:00:00Z', endTime: '2021-01-01T00:00:00Z', visit: { topCandidate: { placeLocation: { latLng: '10°, 20°' } } } }] }));
    expect(r.points).toHaveLength(60);
  });
  it('refuses files that are not a Timeline export', () => {
    expect(() => parseTimeline('not json')).toThrow(/Timeline/);
    expect(() => parseTimeline('{"format":"inkmap-share"}')).toThrow(/Timeline/);
  });
});
