import type { Scenario } from '../../shared/types'
import { useEffect, useRef } from 'react'

export function programCountLabel(count: number): string {
  const lastTwo = count % 100
  const last = count % 10
  const noun = lastTwo >= 11 && lastTwo <= 14 ? 'программ'
    : last === 1 ? 'программа' : last >= 2 && last <= 4 ? 'программы' : 'программ'
  return `${count} ${noun}`
}

interface ScenarioItemProps {
  scenario: Scenario
  isActive: boolean
  onClick: () => void
}

export default function ScenarioItem({ scenario, isActive, onClick }: ScenarioItemProps) {
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (isActive) button.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [isActive])
  return (
    <button ref={button} type="button" className={`scenario-item${isActive ? ' is-active' : ''}`}
      aria-pressed={isActive} onClick={onClick} title={scenario.name}>
      <span className="scenario-icon" aria-hidden="true">{scenario.icon}</span>
      <span className="scenario-info">
        <span className="scenario-name">{scenario.name}</span>
        <span className="scenario-count">{programCountLabel(scenario.programs.length)}</span>
      </span>
    </button>
  )
}
