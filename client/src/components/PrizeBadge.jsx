import { Dices, Gift } from 'lucide-react';

export default function PrizeBadge({ mysteryPrize, currentPrize, prizeRequired, onClick }) {
  let content;
  if (mysteryPrize) {
    content = (
      <>
        <span className="prize-badge-icon prize-badge-icon-mystery">
          <Dices size={26} />
        </span>
        <span className="prize-badge-text">
          <span className="prize-badge-label">Drawing for</span>
          <span className="prize-badge-name">Mystery Prize</span>
        </span>
      </>
    );
  } else if (currentPrize) {
    content = (
      <>
        <img src={currentPrize.imageUrl} alt="" className="prize-badge-icon" />
        <span className="prize-badge-text">
          <span className="prize-badge-label">Drawing for</span>
          <span className="prize-badge-name">{currentPrize.name}</span>
        </span>
      </>
    );
  } else {
    content = (
      <>
        <Gift size={20} />
        <span className="prize-badge-placeholder">
          {prizeRequired ? 'Pick a prize before spinning' : 'Select a prize to draw for'}
        </span>
      </>
    );
  }

  return (
    <button type="button" className="prize-badge" onClick={onClick}>
      {content}
    </button>
  );
}
