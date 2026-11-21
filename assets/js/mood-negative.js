(function () {
  if (location.pathname.split('/').pop() !== 'mood.html') return;

  const choices = [
    { mood: '😢', label: 'Sad' },
    { mood: '😟', label: 'Anxious' },
    { mood: '😠', label: 'Angry' },
    { mood: '😞', label: 'Lonely' },
    { mood: '🥴', label: 'Overwhelmed' }
  ];

  function addChoices() {
    const grid = document.getElementById('moodChoices');
    if (!grid || grid.dataset.negativeChoicesAdded) return;

    choices.forEach(choice => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mood-btn';
      button.dataset.mood = choice.mood;
      button.innerHTML = `<span aria-hidden="true">${choice.mood}</span><small>${choice.label}</small>`;
      grid.appendChild(button);
    });

    grid.dataset.negativeChoicesAdded = 'true';

    // Existing mood labels do not include these new emoji choices. Add a title
    // and aria-label so the extra choices remain accessible and clear.
    grid.querySelectorAll('.mood-btn').forEach(button => {
      const label = button.querySelector('small')?.textContent;
      if (label) button.setAttribute('aria-label', label);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addChoices, { once: true });
  } else {
    addChoices();
  }
})();
