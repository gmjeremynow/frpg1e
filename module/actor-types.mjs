/** Characters and NPCs share the character rules (classes, abilities, saves); monsters use their stat line. */
export const PC_TYPES = ["character", "npc"];
export const isPC = a => !!a && PC_TYPES.includes(a.type);
