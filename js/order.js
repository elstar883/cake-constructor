/**
 * Валидация формы, сборка карточки заказа и копирование.
 *
 * Функции не читают localStorage. Расчёт цены выполняется в pricing.js,
 * здесь используются уже готовые строки расчёта.
 */
(function () {
  "use strict";

  window.CakeApp = window.CakeApp || {};

  var pricing = window.CakeApp.pricing;
  if (!pricing) {
    return;
  }

  var NAME_MIN = 2;
  var NAME_MAX = 50;
  var CONTACT_MAX = 100;
  var PHONE_DIGITS = 11;
  var PHONE_FIRST_DIGIT = /^[78]$/;
  // Телефон может содержать только цифры и форматирующие символы.
  var PHONE_CHARS = /^[+\d\s()-]+$/;
  // Telegram: 5–32 символа, начинается с латинской буквы,
  // далее латинские буквы, цифры и подчёркивание. «@» необязателен.
  var TELEGRAM_PATTERN = /^@?[A-Za-z][A-Za-z0-9_]{4,31}$/;
  var TELEGRAM_MIN = 5;
  var TELEGRAM_MAX = 32;
  var COMMENT_MAX = 200;
  var WEIGHT_FORMATTER = new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  });

  function textLength(value) {
    return typeof value === "string" ? value.length : 0;
  }

  function trimText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function toLocalTimestamp(date) {
    var source = date instanceof Date ? date : new Date();
    var offsetMinutes = -source.getTimezoneOffset();
    var sign = offsetMinutes >= 0 ? "+" : "-";
    var absoluteOffset = Math.abs(offsetMinutes);

    return (
      pricing.toLocalISODate(source) +
      "T" +
      pad(source.getHours()) +
      ":" +
      pad(source.getMinutes()) +
      ":" +
      pad(source.getSeconds()) +
      sign +
      pad(Math.floor(absoluteOffset / 60)) +
      ":" +
      pad(absoluteOffset % 60)
    );
  }

  function findById(items, id) {
    if (!Array.isArray(items) || !id) {
      return null;
    }

    for (var index = 0; index < items.length; index += 1) {
      if (items[index] && items[index].id === id) {
        return items[index];
      }
    }
    return null;
  }

  function validateWeight(selection, config, addError) {
    var weight = Number(selection.weightKg);
    var options = Array.isArray(config.weightOptionsKg)
      ? config.weightOptionsKg.map(Number)
      : [];
    var minWeight = Number(config.minWeightKg);
    var maxWeight = Number(config.maxWeightKg);
    var rangeStart = Number.isFinite(minWeight)
      ? WEIGHT_FORMATTER.format(minWeight)
      : "";
    var rangeEnd = Number.isFinite(maxWeight)
      ? WEIGHT_FORMATTER.format(maxWeight) + " кг"
      : "";
    var message =
      rangeStart && rangeEnd
        ? "Выберите вес от " + rangeStart + " до " + rangeEnd + "."
        : "Выберите вес торта.";

    var isValid =
      Number.isFinite(weight) &&
      options.indexOf(weight) !== -1 &&
      (!Number.isFinite(minWeight) || weight >= minWeight) &&
      (!Number.isFinite(maxWeight) || weight <= maxWeight);

    if (!isValid) {
      addError("weightKg", message);
    }
  }

  function validateFilling(selection, config, addError) {
    if (!findById(config.fillings, selection.fillingId)) {
      addError("fillingId", "Выберите начинку.");
    }
  }

  function validateDecor(selection, config, addError) {
    if (!findById(config.decor, selection.decorId)) {
      addError("decorId", "Выберите декор.");
    }
  }

  function validateInscription(selection, config, addError) {
    var inscription = config.inscription || {};
    if (inscription.enabled === false) {
      return;
    }

    var maxLength = Number(inscription.maxLength);
    var length = textLength(selection.inscription);

    if (Number.isFinite(maxLength) && length > maxLength) {
      addError(
        "inscription",
        "Сократите надпись до " + maxLength + " символов."
      );
    }
  }

  function isPhoneLike(value) {
    return PHONE_CHARS.test(value);
  }

  function isValidPhone(value) {
    if (!isPhoneLike(value)) {
      return false;
    }

    var digits = value.replace(/\D/g, "");
    return (
      digits.length === PHONE_DIGITS &&
      PHONE_FIRST_DIGIT.test(digits.charAt(0))
    );
  }

  function isValidTelegram(value) {
    return TELEGRAM_PATTERN.test(value);
  }

  function isTelegramCandidate(value) {
    var first = value.charAt(0);
    return first === "@" || /^[A-Za-z]$/.test(first);
  }

  function validateContact(contact, addError) {
    if (!contact) {
      addError("customerContact", "Укажите телефон или Telegram.");
      return;
    }

    if (contact.length > CONTACT_MAX) {
      addError(
        "customerContact",
        "Сократите контакт до " + CONTACT_MAX + " символов."
      );
      return;
    }

    // Telegram начинается с «@» или латинской буквы. Остальное с цифрами
    // считаем телефоном, чтобы ошибка соответствовала введённому формату.
    var phoneCandidate = !isTelegramCandidate(contact) && /\d/.test(contact);

    if (!phoneCandidate) {
      if (!isValidTelegram(contact)) {
        addError(
          "customerContact",
          "Укажите Telegram в формате @username: от " +
            TELEGRAM_MIN +
            " до " +
            TELEGRAM_MAX +
            " символов, латиница, цифры и подчёркивание."
        );
      }
      return;
    }

    if (!isValidPhone(contact)) {
      addError(
        "customerContact",
        "Телефон должен содержать 11 цифр и начинаться с 7 или 8. " +
          "Например, +7 999 123-45-67."
      );
    }
  }

  function validateCustomer(selection, addError) {
    var name = trimText(selection.customerName);
    var contact = trimText(selection.customerContact);
    var commentLength = textLength(selection.customerComment);

    if (name.length < NAME_MIN) {
      addError("customerName", "Укажите имя.");
    } else if (name.length > NAME_MAX) {
      addError("customerName", "Сократите имя до " + NAME_MAX + " символов.");
    }

    validateContact(contact, addError);

    if (commentLength > COMMENT_MAX) {
      addError(
        "customerComment",
        "Сократите комментарий до " + COMMENT_MAX + " символов."
      );
    }
  }

  function validateSelection(selection, config, today) {
    var source = selection || {};
    var settings = config || {};
    var errors = [];

    function addError(field, message) {
      errors.push({ field: field, message: message });
    }

    validateWeight(source, settings, addError);
    validateFilling(source, settings, addError);
    validateDecor(source, settings, addError);
    validateInscription(source, settings, addError);

    var dateResult = pricing.validatePickupDate(
      source.pickupDate,
      settings,
      today
    );
    if (!dateResult.valid) {
      addError("pickupDate", dateResult.message);
    }

    var timeResult = pricing.validatePickupTime(source.pickupTime, settings);
    if (!timeResult.valid) {
      addError("pickupTime", timeResult.message);
    }

    validateCustomer(source, addError);

    return {
      valid: errors.length === 0,
      errors: errors,
    };
  }

  function lineOf(lines, key) {
    if (!Array.isArray(lines)) {
      return null;
    }

    for (var index = 0; index < lines.length; index += 1) {
      if (lines[index] && lines[index].key === key) {
        return lines[index];
      }
    }
    return null;
  }

  function amountOf(lines, key) {
    var line = lineOf(lines, key);
    if (!line) {
      return 0;
    }

    var amount = Number(line.amount);
    return Number.isFinite(amount) ? amount : 0;
  }

  /**
   * Снимок заказа на момент формирования.
   * Названия и цены сохраняются, чтобы изменения конфига не искажали карточку.
   */
  function buildOrder(selection, price, config, now) {
    var source = selection || {};
    var calculation = price || { lines: [], total: 0 };
    var settings = config || {};
    var filling = findById(settings.fillings, source.fillingId) || {
      id: source.fillingId || "",
      name: "",
      pricePerKg: 0,
    };
    var decor = findById(settings.decor, source.decorId) || {
      id: source.decorId || "",
      name: "",
      price: 0,
    };
    var inscriptionText = trimText(source.inscription);
    var inscriptionPrice = amountOf(calculation.lines, "inscription");
    var discountLine = lineOf(calculation.lines, "discount");
    var discountAmount = discountLine ? Number(discountLine.amount) : 0;
    var discountPercent = discountLine ? Number(discountLine.percent) : 0;
    var createdAt = now instanceof Date ? now : new Date();
    var pickup = settings.pickup || {};

    return {
      id: "ord_" + createdAt.getTime(),
      createdAt: toLocalTimestamp(createdAt),
      pickupDate: source.pickupDate || "",
      pickupTime: source.pickupTime || "",
      weightKg: Number(source.weightKg),
      filling: {
        id: filling.id,
        name: filling.name,
        pricePerKg: Number(filling.pricePerKg),
      },
      decor: {
        id: decor.id,
        name: decor.name,
        price: Number(decor.price),
      },
      inscription: {
        text: inscriptionText,
        price: inscriptionPrice,
      },
      customer: {
        name: trimText(source.customerName),
        contact: trimText(source.customerContact),
        comment: trimText(source.customerComment),
      },
      pickup: {
        method: "pickup",
        address: trimText(pickup.address),
      },
      price: {
        cake: amountOf(calculation.lines, "cake"),
        decor: amountOf(calculation.lines, "decor"),
        inscription: inscriptionPrice,
        discount: Number.isFinite(discountAmount) ? discountAmount : 0,
        discountPercent: Number.isFinite(discountPercent)
          ? discountPercent
          : 0,
        total: Number(calculation.total) || 0,
      },
    };
  }

  function buildOrderText(order) {
    var snapshot = order || {};
    var customer = snapshot.customer || {};
    var filling = snapshot.filling || {};
    var decor = snapshot.decor || {};
    var inscription = snapshot.inscription || {};
    var pickup = snapshot.pickup || {};
    var price = snapshot.price || {};
    var lines = [];

    lines.push("🎂 Заказ на торт");
    lines.push("");
    lines.push("Имя: " + trimText(customer.name));
    lines.push("Контакт: " + trimText(customer.contact));
    lines.push(
      "Дата и время: " +
        pricing.formatDate(snapshot.pickupDate) +
        ", " +
        (snapshot.pickupTime || "")
    );
    lines.push(
      "Самовывоз: " +
        (trimText(pickup.address) || "адрес уточнит кондитер")
    );
    lines.push("Вес: " + pricing.formatWeight(snapshot.weightKg));
    lines.push("Начинка: " + (filling.name || ""));
    lines.push("Декор: " + (decor.name || ""));

    if (trimText(inscription.text)) {
      lines.push("Надпись: «" + trimText(inscription.text) + "»");
    }
    if (trimText(customer.comment)) {
      lines.push("Комментарий: " + trimText(customer.comment));
    }

    lines.push("");
    lines.push("Расчёт:");
    lines.push(
      "Торт: " +
        pricing.formatWeight(snapshot.weightKg) +
        " × " +
        pricing.formatMoney(filling.pricePerKg) +
        "/кг = " +
        pricing.formatMoney(price.cake)
    );
    lines.push(
      "Декор «" + (decor.name || "") + "»: " + pricing.formatMoney(price.decor)
    );

    if (Number(price.inscription) > 0) {
      lines.push("Надпись: " + pricing.formatMoney(price.inscription));
    }

    if (Number(price.discount) < 0) {
      var discountPercent = Number(price.discountPercent);
      var discountLabel = "Скидка за ранний заказ";
      if (Number.isFinite(discountPercent) && discountPercent > 0) {
        discountLabel += " " + discountPercent + "%";
      }
      lines.push(discountLabel + ": " + pricing.formatMoney(price.discount));
    }

    lines.push("Итого: " + pricing.formatMoney(price.total));
    lines.push("");
    lines.push(
      "Цена предварительная. Кондитер подтвердит заказ и итоговую стоимость."
    );

    return lines.join("\n");
  }

  function execCommandCopy(text) {
    var textarea = document.createElement("textarea");
    var selection = document.getSelection();
    var previousRange =
      selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    var copied = false;

    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.setAttribute("aria-hidden", "true");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    textarea.style.fontSize = "16px";
    document.body.appendChild(textarea);

    try {
      textarea.select();
      textarea.setSelectionRange(0, text.length);
      copied = document.execCommand("copy");
    } catch (error) {
      copied = false;
    }

    document.body.removeChild(textarea);

    if (selection && previousRange) {
      selection.removeAllRanges();
      selection.addRange(previousRange);
    }

    return copied;
  }

  /**
   * Копирует текст и сообщает способ:
   * "clipboard" | "fallback" | "manual".
   */
  function copyText(text) {
    var value = typeof text === "string" ? text : "";

    return new Promise(function (resolve) {
      var clipboard = navigator.clipboard;

      if (
        window.isSecureContext &&
        clipboard &&
        typeof clipboard.writeText === "function"
      ) {
        clipboard.writeText(value).then(
          function () {
            resolve("clipboard");
          },
          function () {
            resolve(execCommandCopy(value) ? "fallback" : "manual");
          }
        );
        return;
      }

      resolve(execCommandCopy(value) ? "fallback" : "manual");
    });
  }

  window.CakeApp.order = window.CakeApp.order || {};
  window.CakeApp.order.validateSelection = validateSelection;
  window.CakeApp.order.buildOrder = buildOrder;
  window.CakeApp.order.buildOrderText = buildOrderText;
  window.CakeApp.order.copyText = copyText;
})();
