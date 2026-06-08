import { formatLocalPhoneInput, phoneToLocalDigits } from '../utils/phone';

export default function PhoneInput({
  value,
  onChange,
  label = 'Номер телефона',
  required = false,
  style,
}) {
  const local = phoneToLocalDigits(value);

  return (
    <div style={{ marginBottom: 14, ...style }}>
      <label className="rb-label" style={{ display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      <div className="rb-input-wrap rb-phone-input">
        <span className="rb-phone-input__prefix" aria-hidden="true">
          +992
        </span>
        <input
          className="rb-input rb-phone-input__field"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={9}
          value={local}
          onChange={(e) => onChange(formatLocalPhoneInput(e.target.value))}
          placeholder="--- --- ---"
          required={required}
          aria-label={`${label}, 9 цифр после +992`}
        />
      </div>
    </div>
  );
}
