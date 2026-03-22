/* ======================================================
   GRAINULATOR — Mobile Slot Machine
   Swipeable prompt picker for touch devices.
   ====================================================== */
(function () {
  "use strict";

  var isMobile = window.matchMedia("(max-width: 768px)").matches;

  var mobileSlotCard = document.getElementById("mobile-slot-card");
  var mobileSlotText = document.getElementById("mobile-slot-text");
  var mobileSpinBtn = document.getElementById("mobile-spin-btn");
  var mobileTryBtn = document.getElementById("mobile-try-btn");
  var mobileCounter = document.getElementById("mobile-slot-counter");

  var mobilePrompts = allPrompts.slice();
  for (var si = mobilePrompts.length - 1; si > 0; si--) {
    var sj = Math.floor(Math.random() * (si + 1));
    var tmp = mobilePrompts[si];
    mobilePrompts[si] = mobilePrompts[sj];
    mobilePrompts[sj] = tmp;
  }

  var mobileSlotIndex = 0;
  var mobileSpinning = false;

  function updateMobileSlot(animate) {
    var p = mobilePrompts[mobileSlotIndex];

    if (animate && !prefersReduced) {
      mobileSlotCard.classList.add("spin-out");
      mobileSlotCard.classList.remove("spin-in");
      setTimeout(function () {
        mobileSlotText.textContent = p.text;
        mobileSlotCard.classList.remove("spin-out");
        mobileSlotCard.classList.add("spin-in");
        mobileSlotCard.classList.add("scripted");
        setTimeout(function () { mobileSlotCard.classList.remove("spin-in"); }, 400);
      }, 150);
    } else {
      mobileSlotText.textContent = p.text;
      mobileSlotCard.classList.add("scripted");
    }
    mobileCounter.textContent = (mobileSlotIndex + 1) + " / " + mobilePrompts.length;
  }

  function mobileSpinNext() {
    if (mobileSpinning) return;
    mobileSpinning = true;
    mobileSlotIndex = (mobileSlotIndex + 1) % mobilePrompts.length;
    updateMobileSlot(true);
    setTimeout(function () { mobileSpinning = false; }, 400);
  }

  function mobileTryCurrent() {
    var p = mobilePrompts[mobileSlotIndex];
    selectPrompt(p.key, p.text);
  }

  if (mobileSpinBtn) mobileSpinBtn.addEventListener("click", mobileSpinNext);
  if (mobileTryBtn) mobileTryBtn.addEventListener("click", mobileTryCurrent);
  if (mobileSlotCard) {
    mobileSlotCard.addEventListener("click", mobileTryCurrent);
    mobileSlotCard.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); mobileTryCurrent(); }
    });
  }

  // Swipe support
  var touchStartX = 0;
  var touchStartY = 0;
  if (mobileSlotCard) {
    mobileSlotCard.addEventListener("touchstart", function (e) {
      touchStartX = e.changedTouches[0].clientX;
      touchStartY = e.changedTouches[0].clientY;
    }, { passive: true });
    mobileSlotCard.addEventListener("touchend", function (e) {
      var dx = e.changedTouches[0].clientX - touchStartX;
      var dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        e.preventDefault();
        if (dx < 0) mobileSpinNext();
        else {
          mobileSlotIndex = (mobileSlotIndex - 1 + mobilePrompts.length) % mobilePrompts.length;
          updateMobileSlot(true);
        }
      }
    }, { passive: false });
  }

  if (isMobile && !prefersReduced) {
    updateMobileSlot(false);
  }
})();
