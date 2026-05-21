import { Link } from 'react-router-dom';
import BoltIcon from './BoltIcon';
import Icon from './Icon';

export default function AppHeader({ showAvatar = true, badge, onBack }) {
  return (
    <header className="rb-header">
      {onBack ? (
        <button type="button" className="rb-header__avatar" onClick={onBack} aria-label="Назад">
          <Icon name="arrow_back" />
        </button>
      ) : (
        <div className="rb-header__brand">
          <BoltIcon size="md" />
          <h1 className="rb-header__logo">RunBonus</h1>
        </div>
      )}
      {badge || (showAvatar && (
        <Link to="/profile" className="rb-header__avatar" aria-label="Профиль">
          <Icon name="person" />
        </Link>
      ))}
    </header>
  );
}
