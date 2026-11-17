// The look plan, in one place. Dusk at a desert relay station: warm sand, rust orange,
// deep teal for the defenders, amber for the attackers. Every colour in the game and the
// HUD comes from these names; lighting makes the shades.
export const PALETTE = {
  canvas: '#1c1712', // dusk sky / page background
  sand: '#c9a06b', // ground, sunlit sand
  sandDark: '#8a6a44', // shaded sand, lane paint
  rust: '#b4552a', // rust orange: crates, site frames, accents
  rustDark: '#7c3418',
  teal: '#1f7a72', // Sentinel (defenders)
  tealDark: '#14534d',
  amber: '#f0a830', // Vanguard (attackers) + HUD accent
  amberDark: '#a86f10',
  ink: '#f2ead9', // HUD text
  muted: '#a89a83', // secondary HUD text
  surface: '#241d16', // panels
  hairline: '#3a2f24', // panel borders
  concrete: '#6e6258', // walls, silos
  concreteDark: '#4a423b',
  steel: '#2e3438', // gunmetal, doors
};

export function shade(name) {
  return PALETTE[name];
}
