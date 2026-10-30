// Nicknames are recorded identity data: never derive one from another field.
export function visibleNickname(employee) {
  const nickname =
    typeof employee?.nickname === "string" ? employee.nickname.trim() : "";
  const fullName =
    typeof employee?.full_name === "string" ? employee.full_name.trim() : "";
  return nickname && nickname.toLowerCase() !== fullName.toLowerCase()
    ? nickname
    : null;
}
