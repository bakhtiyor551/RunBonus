import Icon from '../Icon';

export default function PremiumPaywall({ onClose }) {
  return (
    <div className="rb-nutrition-paywall">
      <div className="rb-nutrition-paywall__icon" aria-hidden>
        <Icon name="restaurant" />
      </div>
      <h2 className="font-display">Питание доступно только в Premium</h2>
      <p className="rb-text-muted">
        RunBonus+ — AI-распознавание еды, дневник питания, аналитика, рекомендации и связь с тренировками.
      </p>
      <ul className="rb-nutrition-paywall__features">
        <li><Icon name="photo_camera" /> Распознавание еды по фото</li>
        <li><Icon name="analytics" /> Графики и баланс калорий</li>
        <li><Icon name="lightbulb" /> AI-рекомендации</li>
        <li><Icon name="emoji_events" /> Бонусы за streak 7 дней</li>
      </ul>
      <button type="button" className="rb-btn-pill rb-nutrition-paywall__cta">
        Подключить RunBonus+
      </button>
      {onClose && (
        <button type="button" className="rb-btn-ghost rb-nutrition-paywall__back" onClick={onClose}>
          Назад
        </button>
      )}
    </div>
  );
}
