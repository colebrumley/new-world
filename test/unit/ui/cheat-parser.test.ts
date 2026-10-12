import { describe, expect, it } from 'vitest';
import { validateAction } from '../../../src/engine/actions';
import { CHEAT_SPECS, type CheatArg, type CheatArgValue, type CheatCommand, type CheatSpec } from '../../../src/engine/cheats';
import { CHEATS } from '../../../src/engine/data/cheats';
import type { GameState, Settlement } from '../../../src/engine/state';
import { cheatHelp, completeCheat, parseCheat, type CheatContext } from '../../../src/ui/cheat-parser';
import { withColony, withUnit, world } from '../../helpers/world';

type Args = Readonly<Record<string, CheatArgValue | undefined>>;

/** A spec of the test's own: its command is just the arguments it was built from. */
const spec = (name: string, args: readonly CheatArg[]): CheatSpec => ({ name, args, about: `about ${name}`, example: name, build: (given) => ({ cheat: name, given }) as unknown as CheatCommand });

const PROBE = spec('probe', [{ name: 'colony', kind: 'colony' }, { name: 'good', kind: 'good' }, { name: 'unitType', kind: 'unitType' }, { name: 'place', kind: 'place', optional: true }]);
const SPECS: readonly CheatSpec[] = [
  PROBE,
  spec('sum', [{ name: 'amount', kind: 'amount', optional: true }]),
  spec('num', [{ name: 'count', kind: 'count' }, { name: 'percent', kind: 'percent' }]),
  spec('at', [{ name: 'square', kind: 'square', optional: true }, { name: 'radius', kind: 'count', optional: true }]),
  spec('spot', [{ name: 'place', kind: 'place' }]),
  spec('one', [{ name: 'kind', kind: 'unitType' }, { name: 'profession', kind: 'profession', optional: true }, { name: 'place', kind: 'place', optional: true }]),
  spec('stock', [{ name: 'colony', kind: 'colony' }, { name: 'what', kind: { anyOf: ['good', { oneOf: ['all'] }] } }, { name: 'amount', kind: 'amount' }]),
  spec('mood', [{ name: 'whom', kind: { anyOf: ['tribe', 'settlement'] } }, { name: 'percent', kind: 'percent' }]),
  spec('switch', [{ name: 'square', kind: 'square' }, { name: 'to', kind: { oneOf: ['on', 'off'] } }]),
  spec('who', [{ name: 'unit', kind: 'unit' }]),
  spec('raise', [{ name: 'colony', kind: 'colony' }, { name: 'building', kind: 'building' }]),
  spec('job', [{ name: 'profession', kind: 'profession' }]),
  spec('seat', [{ name: 'father', kind: 'father' }]),
  spec('ground', [{ name: 'terrain', kind: 'terrain' }, { name: 'resource', kind: { anyOf: ['resource', { oneOf: ['none'] }] }, optional: true }]),
  spec('greet', [{ name: 'power', kind: 'power' }]),
];

const ROWS = ['~~~~~~~~~~', '~~.......~', '~~.......~', '~~.......~', '~~~~~~~~~~'];
const village: Settlement = { id: 's1', tribe: 'sioux', x: 7, y: 3, capital: false, population: 3, growth: 0, taught: false, tributePaid: false, alarm: {}, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null };

function land(): GameState {
  let s = world({ rows: ROWS, players: [{ id: 'a' }, { id: 'b', kind: 'ai' }] });
  s = withColony(s, { id: 'c1', x: 2, y: 2, name: 'Jamestown' });
  s = withColony(s, { id: 'c2', x: 5, y: 2, name: 'New Amsterdam' });
  s = withColony(s, { id: 'c3', x: 7, y: 1, name: 'New Haven' });
  s = withColony(s, { id: 'c4', x: 4, y: 3, name: 'Quebec', owner: 'b' });
  s = withUnit(s, { id: 'u1', type: 'soldier', x: 3, y: 2 });
  s = withUnit(s, { id: 'u2', type: 'caravel', x: 1, y: 1 });
  s = withUnit(s, { id: 'u3', type: 'caravel', x: 1, y: 3 });
  s = withUnit(s, { id: 'u4', type: 'caravel', owner: 'b', x: 0, y: 0 });
  s = withUnit(s, { id: 'u10', type: 'galleon', owner: 'b', x: 9, y: 0 });
  return { ...s, settlements: { s1: village, s2: { ...village, id: 's2', x: 8, y: 3 } } };
}

const ME: CheatContext = { player: 'a', here: { x: 3, y: 2 }, active: 'u1' };
const NOBODY: CheatContext = { player: 'a', here: null, active: null };

/** The arguments a line of the test's own specs was built from; fails if the line is refused. */
function given(text: string, context: CheatContext = ME): Args {
  const r = parseCheat(text, land(), context, SPECS);
  if (!r.ok) throw new Error(`refused: ${r.message}`);
  if (r.action.type !== 'cheat') throw new Error('not a cheat');
  return (r.action.command as unknown as { given: Args }).given;
}

function refusal(text: string, context: CheatContext = ME, specs: readonly CheatSpec[] = SPECS): string {
  const r = parseCheat(text, land(), context, specs);
  if (r.ok) throw new Error(`accepted: ${text}`);
  return r.message;
}

describe('parseCheat: numbers', () => {
  it('an amount adds, takes or sets', () => {
    expect(given('sum 500').amount).toEqual({ set: false, value: 500 });
    expect(given('sum +500').amount).toEqual({ set: false, value: 500 });
    expect(given('sum -200').amount).toEqual({ set: false, value: -200 });
    expect(given('sum =1000').amount).toEqual({ set: true, value: 1000 });
    expect(given('sum').amount).toBeUndefined();
    expect(refusal('sum lots')).toContain('not an amount');
    expect(refusal('sum 1.5')).toContain('not an amount');
    expect(refusal('sum =-5')).toContain('not an amount');
    expect(refusal('sum 99999999999999999999')).toContain('not an amount');
  });

  it('a count is a whole number of zero or more, a percent one up to 100', () => {
    expect(given('num 0 100')).toEqual({ count: 0, percent: 100 });
    expect(refusal('num -1 5')).toContain('not a count');
    expect(refusal('num +1 5')).toContain('not a count');
    expect(refusal('num 3 101')).toContain('not a percent');
  });
});

describe('parseCheat: squares and places', () => {
  it('a square is x,y or here', () => {
    expect(given('at 4,2').square).toEqual({ x: 4, y: 2 });
    expect(given('at here').square).toEqual({ x: 3, y: 2 });
    expect(given('at HERE 2')).toEqual({ square: { x: 3, y: 2 }, radius: 2 });
    expect(refusal('switch 4;2 on')).toContain('not a square');
  });

  it('here with no active unit is refused, and says so', () => {
    expect(refusal('at here', NOBODY)).toContain('no active unit');
    expect(refusal('spot here', NOBODY)).toContain('no active unit');
    expect(refusal('one soldier here', NOBODY)).toContain('no active unit');
  });

  it('a place is a square, here, europe or a colony', () => {
    expect(given('spot 6,1').place).toEqual({ kind: 'square', x: 6, y: 1 });
    expect(given('spot here').place).toEqual({ kind: 'square', x: 3, y: 2 });
    expect(given('spot Europe').place).toEqual({ kind: 'europe' });
    expect(given('spot jamest').place).toEqual({ kind: 'colony', colonyId: 'c1' });
    expect(given('spot "new amsterdam"').place).toEqual({ kind: 'colony', colonyId: 'c2' });
    expect(refusal('spot nowhere')).toContain('not a place');
    expect(refusal('spot new')).toContain('"New Amsterdam", "New Haven"');
  });

  it('a place left out is the active unit\'s square, and a square left out stays out', () => {
    expect(given('probe c1 food galleon').place).toEqual({ kind: 'square', x: 3, y: 2 });
    expect(given('at')).toEqual({});
    expect(refusal('probe c1 food galleon', NOBODY)).toContain('no active unit');
    expect(given('probe c1 food galleon europe', NOBODY).place).toEqual({ kind: 'europe' });
  });
});

describe('parseCheat: names', () => {
  it('by id, by exact name, by a word beginning the name or one of its words, and in quotes', () => {
    expect(given('probe c2 tradeGoods manOWar 1,1')).toMatchObject({ colony: 'c2', good: 'tradeGoods', unitType: 'manOWar' });
    expect(given('probe JAMESTOWN muskets Galleon')).toMatchObject({ colony: 'c1', good: 'muskets', unitType: 'galleon' });
    expect(given('probe amsterdam "trade goods" wagon')).toMatchObject({ colony: 'c2', good: 'tradeGoods', unitType: 'wagonTrain' });
    expect(given('probe hav musk "treasure train"')).toMatchObject({ colony: 'c3', good: 'muskets', unitType: 'treasure' });
    expect(given('probe "New Haven" "Trade" privat')).toMatchObject({ colony: 'c3', good: 'tradeGoods', unitType: 'privateer' });
    expect(given('seat smith').father).toBe('adamSmith');
    expect(given('seat adams').father).toBe('adamSmith');
    expect(given('job farmer').profession).toBe('expertFarmer');
  });

  it('an exact match wins over the names that merely begin so', () => {
    // "Artillery" and "Damaged Artillery"; the ids u1 and u10; "Soldier" the type and the other kinds of unit
    expect(given('probe c1 food artillery').unitType).toBe('artillery');
    expect(given('who u1').unit).toBe('u1');
    expect(given('one soldier').kind).toBe('soldier');
    expect(given('one colonist').kind).toBe('colonist');
  });

  it('an ambiguous name is refused with every candidate', () => {
    const message = refusal('probe new food galleon');
    expect(message).toContain('"New Amsterdam"');
    expect(message).toContain('"New Haven"');
    expect(message).not.toContain('Jamestown');
    expect(refusal('seat peter')).toContain('peterMinuit, peterStuyvesant');
    expect(refusal('job master')).toContain('masterDistiller');
  });

  it('an unknown name is refused, naming what was wanted', () => {
    expect(refusal('probe atlantis food galleon')).toBe('there is no colony "atlantis"');
    expect(refusal('probe c1 gold galleon')).toBe('there is no good "gold"');
    expect(refusal('seat ""')).toContain('needs a name');
  });

  it('unused buildings and professions no colonist holds are not among the candidates', () => {
    expect(given('raise c1 town').building).toBe('townHall');
    expect(refusal('raise c1 townHall2')).toContain('no building');
    expect(refusal('raise c1 capitol')).toContain('no building');
    expect(refusal('job dragoon')).toContain('no profession');
    expect(refusal('job veteranDragoon')).toContain('no profession');
    expect(refusal('job teacher')).toContain('no profession');
    expect(given('job soldier').profession).toBe('veteranSoldier');
  });

  it('a unit is named by id, by what it is, or as the active one', () => {
    expect(given('who active').unit).toBe('u1');
    expect(refusal('who active', NOBODY)).toBe('there is no active unit');
    expect(given('who u3').unit).toBe('u3');
    expect(given('who soldier').unit).toBe('u1');
    // two caravels of our own and one of another power's: ours are the candidates
    const message = refusal('who caravel');
    expect(message).toContain('u2 (Caravel), u3 (Caravel)');
    expect(message).not.toContain('u4');
    // another power's can still be named, for the engine to refuse or allow
    expect(given('who galleon').unit).toBe('u10');
    expect(given('who u4').unit).toBe('u4');
  });

  it('a settlement, a tribe, a terrain, a resource and a power are looked up too', () => {
    expect(given('mood s2 40').whom).toEqual({ kind: 'settlement', value: 's2' });
    expect(given('ground rain').terrain).toBe('rain');
    expect(given('ground "boreal forest" timber')).toEqual({ terrain: 'boreal', resource: { kind: 'resource', value: 'primeTimber' } });
    expect(given('greet France').power).toBe('b');
    expect(given('greet a').power).toBe('a');
    expect(given('greet england').power).toBe('a');
    // an exact id wins over another's exact name: here the first power is called France and the second has the id france
    const state = land();
    const named = { ...state, players: state.players.map((p) => (p.id === 'a' ? { ...p, name: 'France' } : { ...p, id: 'france', nation: 'spain' as const })) };
    expect(parseCheat('greet france', named, ME, SPECS)).toMatchObject({ ok: true, action: { command: { given: { power: 'france' } } } });
  });

  it('a power that has withdrawn or fights for the Crown is no power', () => {
    const state = land();
    const gone = { ...state, players: state.players.map((p) => (p.id === 'b' ? { ...p, withdrawn: true } : p)) };
    expect(parseCheat('greet france', gone, ME, SPECS)).toEqual({ ok: false, message: 'there is no power "france"' });
    expect(parseCheat('greet france', { ...state, crownPlayer: 'b' }, ME, SPECS).ok).toBe(false);
  });
});

describe('parseCheat: anyOf and oneOf', () => {
  it('oneOf takes one of its words, whatever the case', () => {
    expect(given('switch 1,1 ON').to).toBe('on');
    expect(given('switch 1,1 off').to).toBe('off');
    expect(refusal('switch 1,1 maybe')).toContain('not one of on, off');
  });

  it('anyOf takes the first alternative that fits and says which', () => {
    expect(given('stock c1 cloth 50').what).toEqual({ kind: 'good', value: 'cloth' });
    expect(given('stock c1 all =0')).toEqual({ colony: 'c1', what: { kind: 'word', value: 'all' }, amount: { set: true, value: 0 } });
    expect(given('mood sioux 10').whom).toEqual({ kind: 'tribe', value: 'sioux' });
    expect(given('ground hills none').resource).toEqual({ kind: 'word', value: 'none' });
    expect(refusal('stock c1 everything 5')).toBe('"everything" is not <good>|all');
    // "s" begins Sioux alone among the tribes, so the tribe has it before the settlements are asked
    expect(given('mood s 10').whom).toEqual({ kind: 'tribe', value: 'sioux' });
    // "a" begins three tribes and is refused with them
    expect(refusal('mood a 10')).toContain('aztec, arawak, apache');
  });
});

describe('parseCheat: the line', () => {
  it('an optional argument the word does not fit is passed over', () => {
    expect(given('one soldier here')).toEqual({ kind: 'soldier', place: { kind: 'square', x: 3, y: 2 } });
    expect(given('one soldier farmer jamestown')).toEqual({ kind: 'soldier', profession: 'expertFarmer', place: { kind: 'colony', colonyId: 'c1' } });
    expect(given('one soldier europe').place).toEqual({ kind: 'europe' });
    expect(refusal('one soldier wizard')).toBe('"wizard" will not do for [profession] or [place]');
    expect(refusal('one soldier master')).toContain('masterDistiller');
  });

  it('a missing required argument is named', () => {
    expect(refusal('probe')).toBe('probe needs <colony>: probe <colony> <good> <unitType> [place]');
    expect(refusal('probe c1 food')).toContain('probe needs <unitType>');
    expect(refusal('switch 1,1')).toContain('switch needs on|off');
  });

  it('a surplus word is refused', () => {
    expect(refusal('probe c1 food galleon europe again')).toContain('"again" is one word too many');
    expect(refusal('sum 5 6')).toContain('"6" is one word too many');
    expect(refusal('at 1,1 2 3')).toContain('one word too many');
  });

  it('an unknown cheat is refused with the names that begin with its letter, or with all of them', () => {
    expect(refusal('sneak 5')).toBe('there is no cheat "sneak": try sum, spot, stock, switch, seat');
    const all = refusal('xyzzy');
    for (const s of SPECS) expect(all).toContain(s.name);
    expect(refusal('')).toContain('type a cheat');
    expect(refusal('   ')).toContain('type a cheat');
  });

  it('as names the power the cheat is for, by nation, by name or by id', () => {
    const player = (text: string): unknown => {
      const r = parseCheat(text, land(), ME, SPECS);
      return r.ok && r.action.type === 'cheat' ? r.action.player : r;
    };
    expect(player('sum 5')).toBe('a');
    expect(player('as France sum 5')).toBe('b');
    expect(player('AS fra sum 5')).toBe('b');
    expect(player('as b sum 5')).toBe('b');
    expect(refusal('as')).toContain('as needs a power');
    expect(refusal('as prussia sum 5')).toBe('there is no power "prussia"');
    expect(refusal('as france')).toContain('type a cheat');
  });

  it('as moves whose colonies and units are meant', () => {
    const r = parseCheat('as france who caravel', land(), ME, SPECS);
    expect(r).toMatchObject({ ok: true, action: { player: 'b', command: { given: { unit: 'u4' } } } });
  });

  it('a quote left open is refused, and a quote always begins a word', () => {
    expect(refusal('spot "new amsterdam')).toContain('quote is left open');
    expect(refusal('spot new"amsterdam')).toContain('quote is left open');
    expect(refusal('spot jamest"own"')).toContain('"own" is one word too many');
  });

  it('a build that will not have its arguments is a refusal, not a crash', () => {
    const broken: CheatSpec = { ...spec('broken', []), build: () => { throw new TypeError('cheat argument "x" is not a number'); } };
    expect(refusal('broken', ME, [broken])).toBe('cheat argument "x" is not a number');
  });
});

describe('parseCheat: the cheats there are', () => {
  const run = (text: string, context: CheatContext = ME) => parseCheat(text, land(), context);

  it('builds the treasury, Congress and reveal cheats', () => {
    expect(run('gold 5000')).toEqual({ ok: true, action: { type: 'cheat', player: 'a', command: { cheat: 'gold', amount: { set: false, value: 5000 } } } });
    expect(run('gold')).toMatchObject({ action: { command: { cheat: 'gold', amount: { set: false, value: CHEATS.gold } } } });
    expect(run('as france gold =10')).toMatchObject({ action: { player: 'b', command: { cheat: 'gold', amount: { set: true, value: 10 } } } });
    expect(run('crosses 200')).toMatchObject({ action: { command: { cheat: 'crosses', count: 200 } } });
    expect(run('bells')).toMatchObject({ action: { command: { cheat: 'bells', count: CHEATS.bells } } });
    expect(run('father jefferson')).toMatchObject({ action: { command: { cheat: 'father', father: 'thomasJefferson' } } });
    expect(run('father "de las"')).toMatchObject({ action: { command: { cheat: 'father', father: 'bartolomeDeLasCasas' } } });
    expect(run('tax 0')).toMatchObject({ action: { command: { cheat: 'tax', percent: 0 } } });
    expect(run('boycott lift')).toMatchObject({ action: { command: { cheat: 'boycott' } } });
    expect(run('reveal')).toMatchObject({ action: { command: { cheat: 'reveal', at: null, radius: CHEATS.revealRadius } } });
    expect(run('reveal here 5')).toMatchObject({ action: { command: { cheat: 'reveal', at: { x: 3, y: 2 }, radius: 5 } } });
    expect(run('reveal 4,1')).toMatchObject({ action: { command: { cheat: 'reveal', at: { x: 4, y: 1 }, radius: CHEATS.revealRadius } } });
  });

  it('refuses what the grammar refuses', () => {
    expect(run('gold much')).toMatchObject({ ok: false });
    expect(run('father')).toMatchObject({ ok: false, message: expect.stringContaining('father needs <father>') });
    expect(run('boycott')).toMatchObject({ ok: false, message: expect.stringContaining('boycott needs lift') });
    expect(run('boycott raise')).toMatchObject({ ok: false, message: '"raise" is not lift' });
    expect(run('reveal here', NOBODY)).toMatchObject({ ok: false, message: expect.stringContaining('no active unit') });
    expect(run('tax 5 6')).toMatchObject({ ok: false });
  });

  it('every spec\'s own example parses, but for a thing this small world lacks', () => {
    const state = land();
    for (const s of CHEAT_SPECS) {
      const r = parseCheat(s.example, state, ME);
      // an example may name a colony or a unit this world lacks; it must not fail on the cheat's name, its numbers or its words
      if (!r.ok) expect(r.message, s.example).toMatch(/^there is no (colony|unit|settlement|power) /);
    }
  });

  it('the examples of the treasury, Congress and reveal cheats pass the engine\'s own check', () => {
    // a map large enough for the squares the examples name
    const wide = world({ rows: Array.from({ length: 40 }, () => '.'.repeat(40)), players: [{ id: 'a' }, { id: 'b', kind: 'ai' }] });
    for (const name of ['gold', 'crosses', 'bells', 'father', 'tax', 'boycott', 'reveal']) {
      const s = CHEAT_SPECS.find((c) => c.name === name) as CheatSpec;
      const r = parseCheat(s.example, wide, ME);
      expect(r, s.example).toMatchObject({ ok: true });
      if (r.ok) expect(validateAction(wide, r.action), s.example).toEqual({ ok: true });
    }
  });
});

describe('completeCheat', () => {
  const complete = (text: string, specs?: readonly CheatSpec[], context: CheatContext = ME): string[] => completeCheat(text, land(), context, specs);

  it('completes the cheat\'s name', () => {
    expect(complete('')).toEqual(CHEAT_SPECS.map((s) => s.name));
    expect(complete('   ')).toEqual(CHEAT_SPECS.map((s) => s.name));
    expect(complete('go')).toContain('gold');
    expect(complete('go').every((w) => w.startsWith('go'))).toBe(true);
    expect(complete('go', [CHEAT_SPECS[0] as CheatSpec, PROBE])).toEqual(['gold']);
    expect(complete('zz')).toEqual([]);
    expect(complete('s', SPECS)).toEqual(['sum', 'spot', 'stock', 'switch', 'seat']);
  });

  it('offers as, then the powers, then the cheats', () => {
    expect(complete('a', SPECS)).toEqual(['at', 'as']);
    expect(complete('as ', SPECS)).toEqual(['England', 'France']);
    expect(complete('as f', SPECS)).toEqual(['France']);
    expect(complete('as france s', SPECS)).toEqual(['sum', 'spot', 'stock', 'switch', 'seat']);
    expect(complete('as france a', SPECS)).toEqual(['at']);
    expect(complete('as prussia s', SPECS)).toEqual([]);
  });

  it('completes an argument from the candidates of its kind', () => {
    expect(complete('father ad')).toEqual(['adamSmith']);
    expect(complete('father smith')).toEqual(['adamSmith']);
    expect(complete('probe ja', SPECS)).toEqual(['Jamestown']);
    expect(complete('probe new', SPECS)).toEqual(['"New Amsterdam"', '"New Haven"']);
    expect(complete('probe "new h', SPECS)).toEqual(['"New Haven"']);
    expect(complete('probe ', SPECS)).toEqual(['Jamestown', '"New Amsterdam"', '"New Haven"']);
    expect(complete('probe jamestown mu', SPECS)).toEqual(['muskets']);
    expect(complete('probe jamestown food gal', SPECS)).toEqual(['galleon']);
    expect(complete('probe jamestown food galleon ', SPECS)).toEqual(['here', 'europe', 'Jamestown', '"New Amsterdam"', '"New Haven"']);
    expect(complete('as france probe ', SPECS)).toEqual(['Quebec']);
    expect(complete('boycott ')).toEqual(['lift']);
    expect(complete('switch 1,1 o', SPECS)).toEqual(['on', 'off']);
    expect(complete('stock c1 c', SPECS)).toEqual(['cotton', 'cigars', 'cloth', 'coats']);
    expect(complete('stock c1 a', SPECS)).toEqual(['all']);
    expect(complete('who ', SPECS)).toEqual(['active', 'u1', 'u2', 'u3']);
    expect(complete('raise c1 town', SPECS)).toEqual(['townHall']);
    expect(complete('job vet', SPECS)).toEqual(['veteranSoldier']);
    expect(complete('at h', SPECS)).toEqual(['here']);
    // with no active unit, neither `here` nor `active` would be accepted, so neither is offered
    expect(complete('at h', SPECS, NOBODY)).toEqual([]);
    expect(complete('spot ', SPECS, NOBODY)).toEqual(['europe', 'Jamestown', '"New Amsterdam"', '"New Haven"']);
    expect(complete('who ', SPECS, NOBODY)).toEqual(['u1', 'u2', 'u3']);
  });

  it('offers what could follow while the arguments before are optional', () => {
    expect(complete('one soldier e', SPECS)).toEqual(['expertFarmer', 'expertFurTrapper', 'expertLumberjack', 'expertOreMiner', 'expertSilverMiner', 'expertFisherman', 'elderStatesman', 'europe']);
    expect(complete('one soldier here ', SPECS)).toEqual([]);
    expect(complete('sum ', SPECS)).toEqual([]);
  });

  it('offers nothing after a line that has already gone wrong', () => {
    expect(complete('nonsense ', SPECS)).toEqual([]);
    expect(complete('probe atlantis f', SPECS)).toEqual([]);
    expect(complete('sum 5 6 ', SPECS)).toEqual([]);
  });
});

describe('cheatHelp', () => {
  it('builds each usage from the argument names and kinds', () => {
    const usage = (specs?: readonly CheatSpec[]): string[] => cheatHelp(specs).map((h) => h.usage);
    expect(usage(SPECS)).toEqual([
      'probe <colony> <good> <unitType> [place]',
      'sum [amount]',
      'num <count> <percent>',
      'at [square] [radius]',
      'spot <place>',
      'one <kind> [profession] [place]',
      'stock <colony> <good>|all <amount>',
      'mood <tribe>|<settlement> <percent>',
      'switch <square> on|off',
      'who <unit>',
      'raise <colony> <building>',
      'job <profession>',
      'seat <father>',
      'ground <terrain> [<resource>|none]',
      'greet <power>',
    ]);
    expect(usage()).toEqual(expect.arrayContaining(['gold [amount]', 'father <father>', 'tax <percent>', 'boycott lift', 'reveal [square] [radius]']));
  });

  it('carries each spec\'s help line and example, in the specs\' order', () => {
    expect(cheatHelp().map((h) => [h.about, h.example])).toEqual(CHEAT_SPECS.map((s) => [s.about, s.example]));
    expect(cheatHelp(SPECS)[0]).toEqual({ usage: 'probe <colony> <good> <unitType> [place]', about: 'about probe', example: 'probe' });
  });
});
