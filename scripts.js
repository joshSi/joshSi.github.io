const greetings = [
  "Hello, World!",
  "你好，世界！",
  "¡Hola, Mundo!",
  "こんにちは、世界！",
];

const textElement = document.querySelector("#changing-text");
let currentPhraseIndex = 0;
let currentCharIndex = 0;
let isDeleting = false;

function typeWriter() {
  const currentPhrase = greetings[currentPhraseIndex];

  let typingDelay;

  if (isDeleting) {
    currentCharIndex--;
    typingDelay = 50;
  } else {
    currentCharIndex++;
    typingDelay = 200;
  }

  textElement.innerHTML = currentPhrase.slice(0, currentCharIndex) + "<span class='cursor'></span>";

  if (currentCharIndex === currentPhrase.length) {
    isDeleting = true;
    typingDelay = 1000;
  } else if (currentCharIndex === 0) {
    isDeleting = false;
    currentPhraseIndex = (currentPhraseIndex + 1) % greetings.length;
    typingDelay = 1000;
  }

  setTimeout(typeWriter, typingDelay);
}

document.addEventListener("DOMContentLoaded", function () {
  typeWriter();
});
