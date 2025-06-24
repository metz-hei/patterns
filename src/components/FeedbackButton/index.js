import React, { useState } from 'react';
import styles from './styles.module.css';

export default function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        className={styles.feedbackButton}
        onClick={() => setIsOpen(true)}
        aria-label="Обратная связь"
      >
        💬
      </button>

      {isOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsOpen(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <button
              className={styles.closeButton}
              onClick={() => setIsOpen(false)}
              aria-label="Закрыть"
            >
              ×
            </button>
            <iframe
              src="https://forms.yandex.ru/u/68515dde02848f20ddb0ed15?iframe=1"
              frameBorder="0"
              name="ya-form-68515dde02848f20ddb0ed15"
              width="480"
              height="400"
            />
          </div>
        </div>
      )}
    </>
  );
} 