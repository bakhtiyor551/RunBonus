import { useEffect, useId, useRef } from 'react';

function applyCode(value, onChange) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 6);
  onChange(digits);
}

export default function OtpInput({ value, onChange, disabled }) {
  const digits = (value || '').padEnd(6, ' ').slice(0, 6).split('');
  const autofillId = useId();
  const rowRef = useRef(null);

  useEffect(() => {
    const onSms = (e) => applyCode(e.detail, onChange);
    window.addEventListener('runbonus-sms-otp', onSms);
    return () => window.removeEventListener('runbonus-sms-otp', onSms);
  }, [onChange]);

  const setAt = (index, char) => {
    const only = char.replace(/\D/g, '').slice(-1);
    const arr = value.split('');
    while (arr.length < 6) arr.push('');
    arr[index] = only;
    onChange(arr.join('').slice(0, 6));
  };

  const focusCell = (index) => {
    document.getElementById(`otp-${index}`)?.focus();
  };

  const onKeyDown = (index, e) => {
    if (e.key !== 'Backspace') return;

    if (digits[index]?.trim()) {
      e.preventDefault();
      setAt(index, '');
      focusCell(index);
      return;
    }

    if (index > 0) {
      e.preventDefault();
      setAt(index - 1, '');
      focusCell(index - 1);
    }
  };

  const onPaste = (e) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text) {
      e.preventDefault();
      onChange(text);
    }
  };

  return (
    <div className="rb-otp-wrap" ref={rowRef}>
      <input
        id={autofillId}
        className="rb-otp-autofill"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={value}
        disabled={disabled}
        aria-label="Код из SMS"
        tabIndex={-1}
        onChange={(e) => applyCode(e.target.value, onChange)}
      />
      <div className="rb-otp-row" onPaste={onPaste}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <input
            key={i}
            id={`otp-${i}`}
            className="rb-otp-cell"
            type="tel"
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            value={digits[i]?.trim() ? digits[i] : ''}
            disabled={disabled}
            onChange={(e) => {
              setAt(i, e.target.value);
              if (e.target.value && i < 5) {
                focusCell(i + 1);
              }
            }}
            onKeyDown={(e) => onKeyDown(i, e)}
            onFocus={() => {
              if (!digits[i]?.trim() && i > (value || '').length) {
                focusCell((value || '').length);
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}
