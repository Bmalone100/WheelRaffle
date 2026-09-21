import { Dices, ListOrdered } from 'lucide-react';

// Mystery is the implicit default whenever nothing specific is armed — there
// is no more "pick a prize before spinning" placeholder, since a spin is
// always able to fall back to a random draw from the in-stock pool.
export default function PrizeBadge({ currentPrize, queued, queueLength, onClick }) {
  let content;
  if (currentPrize) {
    content = (
      <>
        <img src={currentPrize.imageUrl} alt="" className="prize-badge-icon" />
        <span className="prize-badge-text">
          <span className="prize-badge-label">
            {queued ? (
              <>
                <ListOrdered size={12} /> Next in queue
                {queueLength > 1 ? ` (+${queueLength - 1} more)` : ''}
              </>
            ) : (
              'Drawing for'
            )}
          </span>
          <span className="prize-badge-name">{currentPrize.name}</span>
        </span>
      </>
    );
  } else {
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
  }

  return (
    <button type="button" className="prize-badge" onClick={onClick}>
      {content}
    </button>
  );
}
