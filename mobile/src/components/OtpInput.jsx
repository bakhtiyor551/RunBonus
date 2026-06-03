export default function OtpInput({ value, onChange, disabled }) {
  const digits = (value || '').padEnd(6, ' ').slice(0, 6).split('');

  const setAt = (index, char) => {
    const only = char.replace(/\D/g, '').slice(-1);
    const arr = value.split('');
    while (arr.length < 6) arr.push('');
    arr[index] = only;
    onChange(arr.join('').slice(0, 6));
  };

  const onKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index]?.trim() && index > 0) {
      e.preventDefault();
      const prev = document.getElementById(`otp-${index - 1}`);
      prev?.focus();
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
    <div className="rb-otp-row" onPaste={onPaste}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <input
          key={i}
          id={`otp-${i}`}
          className="rb-otp-cell"
          type="tel"
          inputMode="numeric"
          maxLength={1}
          value={digits[i]?.trim() ? digits[i] : ''}
          disabled={disabled}
          onChange={(e) => {
            setAt(i, e.target.value);
            if (e.target.value && i < 5) {
              document.getElementById(`otp-${i + 1}`)?.focus();
            }
          }}
          onKeyDown={(e) => onKeyDown(i, e)}
        />
      ))}
    </div>
  );
}
