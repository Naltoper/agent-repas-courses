import { useAgentWorkspace } from '../state/AgentWorkspaceContext'
import { Step1Planning } from './tunnel/Step1Planning'
import { Step2Basket } from './tunnel/Step2Basket'
import { Step3StoreMode } from './tunnel/Step3StoreMode'
import { StepStepper } from './tunnel/StepStepper'

export function TunnelScreen() {
  const { tunnelStep } = useAgentWorkspace()

  return (
    <div>
      <StepStepper />
      {tunnelStep === 1 ? <Step1Planning /> : null}
      {tunnelStep === 2 ? <Step2Basket /> : null}
      {tunnelStep === 3 ? <Step3StoreMode /> : null}
    </div>
  )
}
