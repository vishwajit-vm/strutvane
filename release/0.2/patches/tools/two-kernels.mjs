// Proof: with dependents on the published @strutvane/core, the app has two kernels.
import * as oldCore from '@strutvane/core'
import * as fwCore from '@strutvane/framework/core'
const checks = {
  loggerTokenSame: oldCore.LoggerToken === fwCore.LoggerToken,
  notFoundIsFrameworkError: new oldCore.NotFoundError() instanceof fwCore.StrutvaneError,
  problemStatus: fwCore.toProblem(new oldCore.NotFoundError()).status,
}
console.log(JSON.stringify(checks))
process.exit(checks.loggerTokenSame && checks.notFoundIsFrameworkError ? 0 : 1)
