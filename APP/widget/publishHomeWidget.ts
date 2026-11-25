/** Push today's water onto the Android home widget. No-op in the browser. */
export function publishHomeWidget(todayWater: number, goalMl: number, connected: boolean) {
  const bridge = (
    window as unknown as { SuilaWidget?: { publish: (amount: string, goal: string) => void } }
  ).SuilaWidget
  if (!bridge) return
  const goal = connected
    ? `目標 ${goalMl} 毫升 · 已連線`
    : `目標 ${goalMl} 毫升`
  bridge.publish(`${todayWater} 毫升`, goal)
}
