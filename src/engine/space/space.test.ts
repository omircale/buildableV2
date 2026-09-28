import { describe, expect, it } from 'vitest';
import {
  builtPerimeterM,
  emptySpace,
  floorAreaM2,
  insideFootprint,
  matchServices,
  obstaclesHitBy,
  onFloor,
  spaceProblems,
  wallAreaM2,
  wallsOf,
  whatIsMissing,
  type Space,
} from './space';
import { servicesFor } from '../equipment/catalog';

/** A rectangular room, 6.0 × 4.0 m, 2.80 m to the ceiling. */
function rectangularRoom(): Space {
  return {
    ...emptySpace('r1', 'חדר', 'Room'),
    footprintMm: [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 4000 },
      { x: 0, y: 4000 },
    ],
    heightMm: 2800,
  };
}

describe('an unmeasured room says so instead of guessing', () => {
  it('has no walls, no area and no perimeter', () => {
    const empty = emptySpace('r0', 'חלל', 'Space');
    expect(wallsOf(empty)).toEqual([]);
    expect(floorAreaM2(empty)).toBeNull();
    expect(wallAreaM2(empty)).toBeNull();
    expect(builtPerimeterM(empty)).toBeNull();
  });

  it('wall area stays null when only the height is missing', () => {
    // The footprint alone cannot answer "how much paint", and a guessed 2.70 m would look like an answer.
    const room = { ...rectangularRoom(), heightMm: null };
    expect(floorAreaM2(room)).toBeCloseTo(24, 6);
    expect(wallAreaM2(room)).toBeNull();
  });

  it('lists what still has to be measured, in Hebrew and English', () => {
    const gaps = whatIsMissing(emptySpace('r0', 'חלל', 'Space'));
    expect(gaps.map((g) => g.field)).toEqual(['footprint', 'height', 'connections']);
    for (const g of gaps) {
      expect(g.he.length, g.field).toBeGreaterThan(0);
      expect(g.en.length, g.field).toBeGreaterThan(0);
    }
  });

  it('an unmeasured room is incomplete, not wrong', () => {
    // The distinction matters: a gap sends somebody to measure, a problem sends them to re-measure.
    expect(spaceProblems(emptySpace('r0', 'חלל', 'Space'))).toEqual([]);
  });

  it('a recorded point with no position is a gap of its own', () => {
    const room = { ...rectangularRoom(), connections: [{ id: 'c1', kind: 'drain' as const, atMm: null, existing: true }] };
    expect(whatIsMissing(room).map((g) => g.field)).toEqual(['connection:c1']);
  });

  it('a point the project will create is not something to go and measure', () => {
    const room = { ...rectangularRoom(), connections: [{ id: 'new1', kind: 'gas' as const, atMm: null, existing: false }] };
    expect(whatIsMissing(room)).toEqual([]);
  });

  it('a fully surveyed room has nothing missing', () => {
    const room = { ...rectangularRoom(), connections: [{ id: 'c1', kind: 'drain' as const, atMm: { x: 500, y: 0, z: 200 }, existing: true }] };
    expect(whatIsMissing(room)).toEqual([]);
  });
});

describe('walls come from the floor outline', () => {
  it('one wall per edge, closing the loop', () => {
    const walls = wallsOf(rectangularRoom());
    expect(walls.map((w) => w.id)).toEqual(['wall_1', 'wall_2', 'wall_3', 'wall_4']);
    expect(walls.map((w) => w.lengthMm)).toEqual([6000, 4000, 6000, 4000]);
    expect(walls.every((w) => w.built)).toBe(true);
  });

  it('an edge marked open carries no wall — a bar open to the pool deck', () => {
    const room = { ...rectangularRoom(), openEdges: [1] };
    const walls = wallsOf(room);
    expect(walls[1].built).toBe(false);
    // 6 + 6 + 4 = 16 m of wall, not 20.
    expect(builtPerimeterM(room)).toBeCloseTo(16, 6);
  });

  it('an L-shaped room gets six walls and its true area', () => {
    const room: Space = {
      ...emptySpace('l1', 'חדר L', 'L-shaped room'),
      footprintMm: [
        { x: 0, y: 0 },
        { x: 6000, y: 0 },
        { x: 6000, y: 2000 },
        { x: 3000, y: 2000 },
        { x: 3000, y: 4000 },
        { x: 0, y: 4000 },
      ],
      heightMm: 2800,
    };
    expect(wallsOf(room)).toHaveLength(6);
    // 6×2 plus 3×2 = 18 m², not the 24 m² of its bounding box.
    expect(floorAreaM2(room)).toBeCloseTo(18, 6);
  });
});

describe('wall area is what a painter is paid for', () => {
  it('takes the doors and windows out', () => {
    const room = rectangularRoom();
    room.apertures = [
      { id: 'd1', kind: 'door', wallId: 'wall_1', offsetMm: 500, widthMm: 900, heightMm: 2100, sillMm: 0 },
      { id: 'w1', kind: 'window', wallId: 'wall_2', offsetMm: 800, widthMm: 1200, heightMm: 1400, sillMm: 900 },
    ];
    const gross = (2 * (6000 + 4000) * 2800) / 1e6; // 56 m²
    const holes = (900 * 2100 + 1200 * 1400) / 1e6; // 1.89 + 1.68
    expect(wallAreaM2(room)).toBeCloseTo(gross - holes, 6);
  });

  it('counts only the walls that exist', () => {
    const room = { ...rectangularRoom(), openEdges: [1, 3] };
    expect(wallAreaM2(room)).toBeCloseTo((2 * 6000 * 2800) / 1e6, 6);
  });
});

describe('the room against what the equipment needs', () => {
  it('counts the points a project has to create, and names the shortfall', () => {
    // A pool bar with a sink and an ice maker: three water points and two drains are wanted.
    const room = rectangularRoom();
    room.connections = [
      { id: 'c1', kind: 'water_cold', atMm: { x: 500, y: 600, z: 200 }, existing: true },
      { id: 'c2', kind: 'drain', atMm: { x: 600, y: 0, z: 200 }, existing: true },
    ];
    const matches = matchServices(room, servicesFor(['bar_sink_single', 'ice_maker']));

    const cold = matches.find((m) => m.kind === 'water_cold')!;
    expect(cold.required).toBe(2);
    expect(cold.existing).toBe(1);
    expect(cold.toCreate).toBe(1);

    const hot = matches.find((m) => m.kind === 'water_hot')!;
    expect(hot.existing).toBe(0);
    expect(hot.toCreate).toBe(1); // no hot water in the room at all — a real bill line

    const drain = matches.find((m) => m.kind === 'drain')!;
    expect(drain.required).toBe(2);
    expect(drain.toCreate).toBe(1);
  });

  it('never reports a negative shortfall when the room already has plenty', () => {
    const room = rectangularRoom();
    room.connections = [
      { id: 'c1', kind: 'drain', atMm: null, existing: true },
      { id: 'c2', kind: 'drain', atMm: null, existing: true },
      { id: 'c3', kind: 'drain', atMm: null, existing: true },
    ];
    const drain = matchServices(room, [{ kind: 'drain', quantity: 1 }])[0];
    expect(drain.existing).toBe(3);
    expect(drain.toCreate).toBe(0);
  });

  it('a point the project will create does not count as one the room has', () => {
    const room = rectangularRoom();
    room.connections = [{ id: 'new1', kind: 'gas', atMm: null, existing: false }];
    expect(matchServices(room, [{ kind: 'gas', quantity: 1 }])[0]).toMatchObject({ existing: 0, toCreate: 1 });
  });

  it('measures the straight line to the nearest existing point of that kind', () => {
    const room = rectangularRoom();
    room.connections = [
      { id: 'far', kind: 'drain', atMm: { x: 5000, y: 0, z: 3000 }, existing: true },
      { id: 'near', kind: 'drain', atMm: { x: 1000, y: 0, z: 0 }, existing: true },
      { id: 'other', kind: 'water_cold', atMm: { x: 0, y: 0, z: 0 }, existing: true },
    ];
    const drain = matchServices(room, [{ kind: 'drain', quantity: 1 }], { x: 4000, y: 0, z: 0 })[0];
    // 3000 mm to 'near', 4243 mm to 'far'. The cold water point is not a drain and is ignored.
    expect(drain.nearestMm).toBeCloseTo(3000, 6);
  });

  it('gives no distance when nobody measured where the point is', () => {
    // "There is a drain somewhere in that wall" is worth recording and is not a distance.
    const room = rectangularRoom();
    room.connections = [{ id: 'c1', kind: 'drain', atMm: null, existing: true }];
    const drain = matchServices(room, [{ kind: 'drain', quantity: 1 }], { x: 0, y: 0, z: 0 })[0];
    expect(drain.existing).toBe(1);
    expect(drain.nearestMm).toBeNull();
  });

  it('gives no distance when the equipment has no position yet', () => {
    const room = rectangularRoom();
    room.connections = [{ id: 'c1', kind: 'drain', atMm: { x: 0, y: 0, z: 0 }, existing: true }];
    expect(matchServices(room, [{ kind: 'drain', quantity: 1 }])[0].nearestMm).toBeNull();
  });
});

describe('columns are not suggestions', () => {
  const column = {
    id: 'col1',
    nameHe: 'עמוד',
    nameEn: 'Column',
    originMm: { x: 2000, y: 0, z: 1000 },
    sizeMm: { x: 400, y: 2800, z: 400 },
  };

  it('reports a counter that runs into one', () => {
    const room = { ...rectangularRoom(), obstacles: [column] };
    const hits = obstaclesHitBy(room, { x: 1800, y: 0, z: 900 }, { x: 1200, y: 900, z: 600 });
    expect(hits.map((o) => o.id)).toEqual(['col1']);
  });

  it('leaves a counter beside one alone', () => {
    const room = { ...rectangularRoom(), obstacles: [column] };
    expect(obstaclesHitBy(room, { x: 0, y: 0, z: 0 }, { x: 1900, y: 900, z: 600 })).toEqual([]);
  });

  it('a counter that clears it in height only is still clear', () => {
    // A down-stand beam at 2.2 m and a 0.9 m counter share plan but not space.
    const beam = { ...column, id: 'beam1', originMm: { x: 0, y: 2200, z: 0 }, sizeMm: { x: 6000, y: 600, z: 400 } };
    const room = { ...rectangularRoom(), obstacles: [beam] };
    expect(obstaclesHitBy(room, { x: 0, y: 0, z: 0 }, { x: 2000, y: 900, z: 600 })).toEqual([]);
  });
});

describe('inside the room', () => {
  it('answers for a rectangle', () => {
    const room = rectangularRoom();
    expect(insideFootprint(room, { x: 3000, y: 2000 })).toBe(true);
    expect(insideFootprint(room, { x: 7000, y: 2000 })).toBe(false);
  });

  it('answers for the notch of an L-shaped room', () => {
    const room: Space = {
      ...emptySpace('l1', 'חדר L', 'L'),
      footprintMm: [
        { x: 0, y: 0 },
        { x: 6000, y: 0 },
        { x: 6000, y: 2000 },
        { x: 3000, y: 2000 },
        { x: 3000, y: 4000 },
        { x: 0, y: 4000 },
      ],
      heightMm: 2800,
    };
    expect(insideFootprint(room, { x: 1000, y: 3000 })).toBe(true);
    // The cut-out corner is outside the room even though it is inside the bounding box.
    expect(insideFootprint(room, { x: 5000, y: 3000 })).toBe(false);
  });

  it('never claims a point is inside a room nobody measured', () => {
    expect(insideFootprint(emptySpace('r0', 'חלל', 'S'), { x: 0, y: 0 })).toBe(false);
  });

  it('converts a 3D point to a plan point on the floor axis, not the height axis', () => {
    // Getting this backwards puts a water point in a wall; the helper exists so nobody has to remember.
    expect(onFloor({ x: 1200, y: 600, z: 300 })).toEqual({ x: 1200, y: 300 });
  });
});

describe('a measurement error is reported, not absorbed', () => {
  it('a clean room reports nothing', () => {
    const room = rectangularRoom();
    room.apertures = [{ id: 'd1', kind: 'door', wallId: 'wall_1', offsetMm: 500, widthMm: 900, heightMm: 2100, sillMm: 0 }];
    expect(spaceProblems(room)).toEqual([]);
  });

  it('a window wider than its wall is caught instead of clamped to zero', () => {
    const room = rectangularRoom();
    room.apertures = [{ id: 'w1', kind: 'window', wallId: 'wall_2', offsetMm: 3000, widthMm: 2000, heightMm: 1400, sillMm: 900 }];
    const codes = spaceProblems(room).map((p) => p.code);
    expect(codes).toContain('aperture_past_wall_end');
  });

  it('a door taller than the ceiling is caught', () => {
    const room = rectangularRoom();
    room.apertures = [{ id: 'd1', kind: 'door', wallId: 'wall_1', offsetMm: 0, widthMm: 900, heightMm: 3000, sillMm: 0 }];
    expect(spaceProblems(room).map((p) => p.code)).toContain('aperture_past_ceiling');
  });

  it('two openings on the same stretch of wall cannot both be right', () => {
    const room = rectangularRoom();
    room.apertures = [
      { id: 'w1', kind: 'window', wallId: 'wall_1', offsetMm: 1000, widthMm: 1200, heightMm: 1400, sillMm: 900 },
      { id: 'w2', kind: 'window', wallId: 'wall_1', offsetMm: 1800, widthMm: 1200, heightMm: 1400, sillMm: 900 },
    ];
    expect(spaceProblems(room).map((p) => p.code)).toContain('apertures_overlap');
  });

  it('two openings on different walls at the same offset are fine', () => {
    const room = rectangularRoom();
    room.apertures = [
      { id: 'w1', kind: 'window', wallId: 'wall_1', offsetMm: 1000, widthMm: 1200, heightMm: 1400, sillMm: 900 },
      { id: 'w2', kind: 'window', wallId: 'wall_3', offsetMm: 1000, widthMm: 1200, heightMm: 1400, sillMm: 900 },
    ];
    expect(spaceProblems(room)).toEqual([]);
  });

  it('an opening on a wall that does not exist is a red, not a crash', () => {
    const room = rectangularRoom();
    room.apertures = [{ id: 'd1', kind: 'door', wallId: 'wall_9', offsetMm: 0, widthMm: 900, heightMm: 2100, sillMm: 0 }];
    const problems = spaceProblems(room);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ code: 'aperture_on_no_wall', severity: 'red' });
  });

  it('a connection point outside the room points at the reference, not the plumbing', () => {
    // Almost always a survey measured from a different corner. Saying so beats moving the point.
    const room = rectangularRoom();
    room.connections = [{ id: 'c1', kind: 'drain', atMm: { x: 9000, y: 0, z: 200 }, existing: true }];
    const problems = spaceProblems(room);
    expect(problems.map((p) => p.code)).toEqual(['connection_outside_room']);
    expect(problems[0].severity).toBe('yellow');
    expect(problems[0].he.length).toBeGreaterThan(0);
    expect(problems[0].en.length).toBeGreaterThan(0);
  });

  it('a column outside the room is reported the same way', () => {
    const room = rectangularRoom();
    room.obstacles = [
      { id: 'col1', nameHe: 'עמוד', nameEn: 'Column', originMm: { x: 8000, y: 0, z: 1000 }, sizeMm: { x: 400, y: 2800, z: 400 } },
    ];
    expect(spaceProblems(room).map((p) => p.code)).toEqual(['obstacle_outside_room']);
  });

  it('every problem is written in both languages', () => {
    const room = rectangularRoom();
    room.apertures = [{ id: 'w1', kind: 'window', wallId: 'wall_2', offsetMm: 3900, widthMm: 900, heightMm: 4000, sillMm: 0 }];
    const problems = spaceProblems(room);
    expect(problems.length).toBeGreaterThan(1);
    for (const p of problems) {
      expect(p.he.length, p.code).toBeGreaterThan(0);
      expect(p.en.length, p.code).toBeGreaterThan(0);
      expect(p.subject.length, p.code).toBeGreaterThan(0);
    }
  });
});
