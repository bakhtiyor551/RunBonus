import { useEffect, useState } from 'react';
import { api } from '../api';
import DetailSheet from './DetailSheet';
import Icon from './Icon';
import { showToast } from '../utils/toast';
import { compressReceiptImage } from '../utils/compressImage';

const ACCOUNTS_FALLBACK = [
  { id: 'alif', provider: 'Alif Mobi', number: '+992 90 000 00 01', holder: 'RunBonus' },
  { id: 'dc', provider: 'DC Wallet', number: '+992 90 000 00 02', holder: 'RunBonus' },
  { id: 'eskhata', provider: 'Эсхата Онлайн', number: '+992 90 000 00 03', holder: 'RunBonus' },
];

/** Текст для поля payment_details в заказе (админка + Telegram). */
export function formatMobilePaymentDetails(recipientAccount, senderWallet) {
  const to = recipientAccount
    ? `На: ${recipientAccount.provider} — ${recipientAccount.number}`
    : '';
  const from = senderWallet?.trim() ? `От: ${senderWallet.trim()}` : '';
  return [to, from].filter(Boolean).join('\n');
}

export function validateMobileTransfer({ recipientId, senderWallet, confirmed, receiptDataUrl, accounts }) {
  if (!recipientId) return 'Выберите кошелёк RunBonus для перевода';
  const acc = accounts?.find((a) => a.id === recipientId);
  if (!acc) return 'Выберите кошелёк RunBonus для перевода';
  if (!senderWallet?.trim()) return 'Укажите номер кошелька, с которого вы перевели';
  if (!confirmed) return 'Подтвердите, что перевод выполнен';
  if (!receiptDataUrl) return 'Загрузите чек транзакции';
  return null;
}

export default function MobileTransferModal({ open, totalAmount, onClose, onConfirm, submitting }) {
  const [accounts, setAccounts] = useState(ACCOUNTS_FALLBACK);
  const [recipientId, setRecipientId] = useState('');
  const [senderWallet, setSenderWallet] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState('');
  const [receiptDataUrl, setReceiptDataUrl] = useState('');

  const selectedAccount = accounts.find((a) => a.id === recipientId) || null;

  useEffect(() => {
    if (!open) return;
    api('/api/mobile/mobile-payment-accounts')
      .then(setAccounts)
      .catch(() => setAccounts(ACCOUNTS_FALLBACK));
  }, [open]);

  useEffect(() => {
    if (!open) {
      setRecipientId('');
      setSenderWallet('');
      setConfirmed(false);
      setReceiptPreview('');
      setReceiptDataUrl('');
    }
  }, [open]);

  const copyNumber = async (number) => {
    try {
      await navigator.clipboard.writeText(number);
      await showToast('Номер скопирован', { color: 'success', duration: 1500 });
    } catch {
      await showToast('Не удалось скопировать');
    }
  };

  const onReceiptPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      await showToast('Выберите изображение (фото чека)');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      await showToast('Файл не больше 4 МБ');
      return;
    }
    try {
      const dataUrl = await compressReceiptImage(file);
      setReceiptDataUrl(dataUrl);
      setReceiptPreview(dataUrl);
    } catch {
      await showToast('Не удалось загрузить чек');
    }
    e.target.value = '';
  };

  const handleConfirm = async () => {
    const err = validateMobileTransfer({
      recipientId,
      senderWallet,
      confirmed,
      receiptDataUrl,
      accounts,
    });
    if (err) {
      await showToast(err);
      return;
    }
    await onConfirm({
      payment_details: formatMobilePaymentDetails(selectedAccount, senderWallet),
      company_wallet_id: recipientId,
      company_wallet_number: selectedAccount?.number || '',
      sender_wallet: senderWallet.trim(),
      payment_receipt_base64: receiptDataUrl,
    });
  };

  return (
    <DetailSheet
      open={open}
      title="Мобильный перевод"
      titleId="mobile-transfer-title"
      onClose={onClose}
    >
      <p className="rb-text-muted" style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.5 }}>
        Переведите <strong style={{ color: 'var(--rb-neon)' }}>{totalAmount} сомони</strong>. Выберите наш
        кошелёк — откроется номер для перевода. Затем укажите свой кошелёк и прикрепите чек.
      </p>

      <p className="rb-label" style={{ marginBottom: 10 }}>
        Кошелёк RunBonus
      </p>
      <div className="withdraw-methods" style={{ marginBottom: 12 }}>
        {accounts.map((acc) => (
          <button
            key={acc.id}
            type="button"
            className={`withdraw-method-btn${recipientId === acc.id ? ' withdraw-method-btn--active' : ''}`}
            onClick={() => setRecipientId(acc.id)}
          >
            {acc.provider}
          </button>
        ))}
      </div>

      {selectedAccount ? (
        <div className="rb-mobile-account glass-card rb-mobile-account--selected">
          <div>
            <p className="rb-mobile-account__provider">{selectedAccount.provider}</p>
            <p className="rb-mobile-account__number font-display">{selectedAccount.number}</p>
            {selectedAccount.holder && (
              <p className="rb-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                {selectedAccount.holder}
              </p>
            )}
          </div>
          <button
            type="button"
            className="rb-btn-pill rb-mobile-account__copy"
            onClick={() => copyNumber(selectedAccount.number)}
          >
            <Icon name="content_copy" />
            Копировать
          </button>
        </div>
      ) : (
        <p className="rb-text-muted" style={{ margin: '0 0 16px', fontSize: 13 }}>
          Нажмите на кошелёк выше, чтобы увидеть номер для перевода.
        </p>
      )}

      <div style={{ marginTop: 16 }}>
        <label className="rb-label" style={{ display: 'block', marginBottom: 4 }}>
          Ваш номер кошелька (с которого перевели)
        </label>
        <div className="rb-input-wrap">
          <input
            className="rb-input"
            type="tel"
            value={senderWallet}
            onChange={(e) => setSenderWallet(e.target.value)}
            placeholder="+992 …"
          />
        </div>
      </div>

      <label className="rb-mobile-check" style={{ marginTop: 16 }}>
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        <span>Я перевёл деньги на выбранный счёт</span>
      </label>

      <div style={{ marginTop: 16 }}>
        <p className="rb-label" style={{ marginBottom: 8 }}>
          Чек транзакции
        </p>
        <label className="rb-receipt-upload">
          <input type="file" accept="image/*" capture="environment" onChange={onReceiptPick} hidden />
          {receiptPreview ? (
            <img src={receiptPreview} alt="Чек" className="rb-receipt-upload__preview" />
          ) : (
            <>
              <Icon name="receipt_long" style={{ fontSize: 40, color: 'var(--rb-neon)' }} />
              <span>Загрузить фото чека</span>
            </>
          )}
        </label>
        {receiptPreview && (
          <button
            type="button"
            className="rb-text-muted"
            style={{ marginTop: 8, background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer' }}
            onClick={() => {
              setReceiptPreview('');
              setReceiptDataUrl('');
            }}
          >
            Удалить и выбрать другой
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 24, paddingBottom: 8 }}>
        <button type="button" className="rb-btn-pill" style={{ flex: 1 }} onClick={onClose} disabled={submitting}>
          Отмена
        </button>
        <button type="button" className="rb-btn-primary" style={{ flex: 1 }} onClick={handleConfirm} disabled={submitting}>
          {submitting ? 'Отправка…' : 'Подтвердить заказ'}
        </button>
      </div>
    </DetailSheet>
  );
}
