const menuToggle = document.querySelector('.menu-toggle');
const mainNav = document.querySelector('.main-nav');
if (menuToggle && mainNav) {
  menuToggle.addEventListener('click', () => {
    const isOpen = mainNav.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
    menuToggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
  });
  mainNav.addEventListener('click', (event) => {
    if (event.target.closest('a')) {
      mainNav.classList.remove('open');
      menuToggle.setAttribute('aria-expanded', 'false');
      menuToggle.setAttribute('aria-label', 'Open navigation');
    }
  });
}
