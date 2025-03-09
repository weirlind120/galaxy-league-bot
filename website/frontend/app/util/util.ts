export const teamInitials = (name: string) =>
  name
    .split(/[^a-zA-Z]/)
    .map((word) => word.charAt(0))
    .join("");