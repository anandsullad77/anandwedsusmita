export default function InvitationTypeSwitch({ value, onChange, individualDisabled = false }: { value: 'individual' | 'family'; onChange: (value: 'individual' | 'family') => void; individualDisabled?: boolean }) {
  return <div className="invitation-type-switch" role="group" aria-label="Invitation type">
    <button type="button" className="chip" aria-pressed={value === 'individual'} disabled={individualDisabled} onClick={() => onChange('individual')}>Individual</button>
    <button type="button" className="chip" aria-pressed={value === 'family'} onClick={() => onChange('family')}>Family</button>
  </div>;
}
