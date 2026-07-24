/** Prop sprites exported from the Unity build (individual PNGs, not spritesheets). */
export const PROP_TEXTURE_KEYS = {
  trashBin: 'prop-trash-bin',
  puddle: 'prop-puddle',
  lampLeft: 'prop-lamp-left',
  lampRight: 'prop-lamp-right',
  manholeClosed: 'prop-manhole-closed',
  manholeOpen: 'prop-manhole-open',
  passport: 'prop-passport',
  paperStraw: 'prop-paper-straw',
  syringe: 'prop-syringe',
  davosPlane: 'prop-davos-plane',
} as const;

export const PROP_TEXTURE_PATHS: Record<string, string> = {
  [PROP_TEXTURE_KEYS.trashBin]: 'assets/props/trash-bin.png',
  [PROP_TEXTURE_KEYS.puddle]: 'assets/props/puddle.png',
  [PROP_TEXTURE_KEYS.lampLeft]: 'assets/props/lamp-left.png',
  [PROP_TEXTURE_KEYS.lampRight]: 'assets/props/lamp-right.png',
  [PROP_TEXTURE_KEYS.manholeClosed]: 'assets/props/manhole-closed.png',
  [PROP_TEXTURE_KEYS.manholeOpen]: 'assets/props/manhole-open.png',
  [PROP_TEXTURE_KEYS.passport]: 'assets/props/passport.png',
  [PROP_TEXTURE_KEYS.paperStraw]: 'assets/props/paper-straw.png',
  [PROP_TEXTURE_KEYS.syringe]: 'assets/props/syringe.png',
  [PROP_TEXTURE_KEYS.davosPlane]: 'assets/props/davos-plane.png',
};
