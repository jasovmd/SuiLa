
import assert from "node:assert/strict"
import { tabProgress } from "./swipe.ts"


assert.equal(tabProgress(60, 60, 260, 3), 0)
assert.equal(tabProgress(160, 60, 260, 3), 1)
assert.equal(tabProgress(260, 60, 260, 3), 2)
assert.equal(tabProgress(200, 60, 260, 3), 1.4)

assert.equal(tabProgress(0, 60, 260, 3), 0)
assert.equal(tabProgress(400, 60, 260, 3), 2)

assert.equal(Math.round(tabProgress(205, 60, 260, 3)), 1)
assert.equal(Math.round(tabProgress(215, 60, 260, 3)), 2)

assert.equal(tabProgress(100, 60, 60, 1), 0)
assert.equal(tabProgress(100, 0, 0, 3), 0)

console.log("swipe.ts: all checks passed")
