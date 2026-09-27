// WoW Forever race/class combinations (as announced by Blizzard) and server types.
// Keep in sync with the copy in public/index.html.

export const RACES = {
  Horde: {
    Orc: ["Warrior", "Hunter", "Mage", "Rogue", "Warlock", "Shaman"],
    Tauren: ["Warrior", "Hunter", "Druid", "Shaman"],
    Troll: ["Warrior", "Hunter", "Mage", "Rogue", "Priest", "Warlock", "Shaman"],
    Undead: ["Warrior", "Mage", "Rogue", "Priest", "Warlock", "Paladin"],
    Skyborne: ["Warrior", "Hunter", "Rogue", "Druid", "Shaman"],
  },
  Alliance: {
    Human: ["Warrior", "Paladin", "Hunter", "Rogue", "Priest", "Mage", "Warlock"],
    Dwarf: ["Warrior", "Hunter", "Rogue", "Priest", "Paladin", "Shaman"],
    Gnome: ["Warrior", "Rogue", "Mage", "Warlock", "Priest"],
    "Night Elf": ["Warrior", "Hunter", "Rogue", "Priest", "Druid"],
    Skyborne: ["Warrior", "Hunter", "Mage", "Rogue", "Druid"],
  },
};

export const SERVER_TYPES = ["Normal", "PvP", "Roleplaying", "Hardcore", "Undecided"];
export const ROLES = ["DPS", "Tank", "Healer"];
