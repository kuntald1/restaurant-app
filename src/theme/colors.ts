// src/theme/colors.ts
export const colors = {
  bg: "#FFFFFF",
  surface: "#F7F8F7",
  border: "#E3E6E3",
  text: "#1A1F1A",
  textMuted: "#6B7169",
  primary: "#1E8E4A", // matches web "Generate Bill" green
  primaryDark: "#166B39",
  danger: "#D64545",
  warning: "#B8860B",

  tableFree: "#E7F6EC",
  tableFreeBorder: "#8FD8AA",
  tableOccupied: "#FBEFDD",
  tableOccupiedBorder: "#E8B96B",
  tableReserved: "#EDEBFB",
  tableReservedBorder: "#B6ACEA",

  veg: "#2E9E4E",
  nonVeg: "#C0392B",
};

export const statusColor = {
  free: { bg: colors.tableFree, border: colors.tableFreeBorder },
  occupied: { bg: colors.tableOccupied, border: colors.tableOccupiedBorder },
  reserved: { bg: colors.tableReserved, border: colors.tableReservedBorder },
} as const;
