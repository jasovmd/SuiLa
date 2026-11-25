
export const halfHours = Array.from(
  { length: 48 },
  (_, index) =>
    `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`,
)

export const splitTime = (time: string) =>
  time.split(":").map(Number) as [number, number]
