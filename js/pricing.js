/**
 * Расчёт стоимости, форматирование и проверка дат.
 *
 * Функции не обращаются к DOM и не читают localStorage.
 * Все денежные значения — целые рубли.
 */
(function () {
  "use strict";

  window.CakeApp = window.CakeApp || {};

  var MONEY_FORMATTER = new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  });
  var WEIGHT_FORMATTER = new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  });
  var DATE_FORMATTER = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  function formatMoney(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) {
      return "—";
    }
    var rounded = Math.round(number);
    var sign = rounded < 0 ? "−" : "";
    return sign + MONEY_FORMATTER.format(Math.abs(rounded)) + " ₽";
  }

  function formatWeight(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) {
      return "—";
    }
    return WEIGHT_FORMATTER.format(number) + " кг";
  }

  function toLocalISODate(date) {
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function parseLocalISODate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return null;
    }

    var year = Number(value.slice(0, 4));
    var month = Number(value.slice(5, 7));
    var day = Number(value.slice(8, 10));
    var date = new Date(year, month - 1, day);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }

    return date;
  }

  function formatDate(value) {
    var date = typeof value === "string" ? parseLocalISODate(value) : value;
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return "—";
    }
    return DATE_FORMATTER.format(date);
  }

  function addDays(date, days) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  }

  function getDateLimits(config, today) {
    var settings = config || {};
    var source =
      today instanceof Date && !Number.isNaN(today.getTime())
        ? today
        : new Date();
    var base = new Date(
      source.getFullYear(),
      source.getMonth(),
      source.getDate()
    );
    var leadDays = Math.max(0, Number(settings.leadTimeDays) || 0);
    var horizonDays = Math.max(
      leadDays,
      Number(settings.maxLeadTimeDays) || leadDays
    );

    return {
      minDate: toLocalISODate(addDays(base, leadDays)),
      maxDate: toLocalISODate(addDays(base, horizonDays)),
    };
  }

  function daysWord(count) {
    var absolute = Math.abs(count) % 100;
    var lastDigit = absolute % 10;

    if (absolute > 10 && absolute < 20) {
      return "дней";
    }
    if (lastDigit === 1) {
      return "день";
    }
    if (lastDigit >= 2 && lastDigit <= 4) {
      return "дня";
    }
    return "дней";
  }

  function formatDays(count) {
    var number = Number(count);
    if (!Number.isFinite(number)) {
      return "";
    }
    var rounded = Math.round(number);
    return rounded + " " + daysWord(rounded);
  }

  /**
   * Разница календарных дней между датой выдачи и сегодняшней датой.
   * Считается по локальным компонентам, без перевода в UTC-строку.
   * Возвращает null, если дата некорректна.
   */
  function getDaysBeforePickup(value, today) {
    var pickup = typeof value === "string" ? parseLocalISODate(value) : value;
    if (!(pickup instanceof Date) || Number.isNaN(pickup.getTime())) {
      return null;
    }

    var source =
      today instanceof Date && !Number.isNaN(today.getTime())
        ? today
        : new Date();
    var base = new Date(
      source.getFullYear(),
      source.getMonth(),
      source.getDate()
    );
    var pickupDay = Date.UTC(
      pickup.getFullYear(),
      pickup.getMonth(),
      pickup.getDate()
    );
    var baseDay = Date.UTC(base.getFullYear(), base.getMonth(), base.getDate());

    return Math.round((pickupDay - baseDay) / 86400000);
  }

  /**
   * Подбирает подходящий порог скидки за ранний заказ.
   * Возвращает null, если скидка отключена, дата не выбрана или порог не достигнут.
   */
  function resolveEarlyBookingDiscount(pickupDate, settings, today) {
    var discountConfig = (settings || {}).earlyBookingDiscount || {};
    if (discountConfig.enabled === false) {
      return null;
    }

    var tiers = Array.isArray(discountConfig.tiers)
      ? discountConfig.tiers
      : [];
    var days = getDaysBeforePickup(pickupDate, today);

    if (days === null) {
      return null;
    }

    var best = null;
    tiers.forEach(function (tier) {
      if (!tier) {
        return;
      }

      var minDays = Number(tier.minDays);
      var percent = Number(tier.percent);

      if (
        !Number.isFinite(minDays) ||
        !Number.isFinite(percent) ||
        percent <= 0 ||
        days < minDays
      ) {
        return;
      }

      if (
        !best ||
        percent > best.percent ||
        (percent === best.percent && minDays > best.minDays)
      ) {
        best = { days: days, minDays: minDays, percent: percent };
      }
    });

    return best;
  }

  function validatePickupDate(value, config, today) {
    var settings = config || {};
    var limits = getDateLimits(settings, today);
    var leadDays = Math.max(0, Number(settings.leadTimeDays) || 0);
    var baseResult = {
      valid: false,
      message: "",
      minDate: limits.minDate,
      maxDate: limits.maxDate,
    };

    if (!value) {
      baseResult.message = "Выберите дату выдачи.";
      return baseResult;
    }

    if (!parseLocalISODate(value)) {
      baseResult.message = "Выберите корректную дату выдачи.";
      return baseResult;
    }

    if (value < limits.minDate) {
      baseResult.message =
        "Минимальный срок заказа — " +
        leadDays +
        " " +
        daysWord(leadDays) +
        ". Ближайшая дата: " +
        formatDate(limits.minDate) +
        ".";
      return baseResult;
    }

    if (value > limits.maxDate) {
      baseResult.message =
        "Выберите дату не позже " + formatDate(limits.maxDate) + ".";
      return baseResult;
    }

    return {
      valid: true,
      message: "",
      minDate: limits.minDate,
      maxDate: limits.maxDate,
    };
  }

  function parseTimeToMinutes(value) {
    if (typeof value !== "string") {
      return null;
    }

    var match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
    if (!match) {
      return null;
    }

    return Number(match[1]) * 60 + Number(match[2]);
  }

  function minutesToTime(totalMinutes) {
    var hours = Math.floor(totalMinutes / 60);
    var minutes = totalMinutes % 60;
    return String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0");
  }

  function getPickupTimeOptions(config) {
    var settings = config || {};
    var pickup = settings.pickup || {};
    var from = parseTimeToMinutes(pickup.from);
    var to = parseTimeToMinutes(pickup.to);
    var step = Number(pickup.stepMinutes);

    if (from === null || to === null || to < from) {
      return [];
    }

    if (!Number.isFinite(step) || step <= 0) {
      step = 30;
    }

    var options = [];
    for (var minutes = from; minutes <= to; minutes += step) {
      options.push(minutesToTime(minutes));
    }
    return options;
  }

  function validatePickupTime(value, config) {
    var settings = config || {};
    var pickup = settings.pickup || {};
    var options = getPickupTimeOptions(settings);
    var range =
      pickup.from && pickup.to ? "с " + pickup.from + " до " + pickup.to : "";

    if (!value) {
      return {
        valid: false,
        message: range ? "Выберите время " + range + "." : "Выберите время.",
      };
    }

    if (options.indexOf(value) === -1) {
      return {
        valid: false,
        message: range ? "Выберите время " + range + "." : "Выберите время.",
      };
    }

    return { valid: true, message: "" };
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

  function calculatePrice(selection, config, today) {
    var source = selection || {};
    var settings = config || {};
    var weight = Number(source.weightKg);
    var hasWeight = Number.isFinite(weight) && weight > 0;
    var filling = findById(settings.fillings, source.fillingId);
    var decor = findById(settings.decor, source.decorId);
    var pricePerKg = filling ? Number(filling.pricePerKg) : NaN;
    var decorPrice = decor ? Number(decor.price) : NaN;

    var cakeAmount =
      hasWeight && Number.isFinite(pricePerKg)
        ? Math.round(weight * pricePerKg)
        : null;
    var decorAmount = Number.isFinite(decorPrice)
      ? Math.round(decorPrice)
      : null;

    var inscriptionConfig = settings.inscription || {};
    var inscriptionText =
      typeof source.inscription === "string" ? source.inscription.trim() : "";
    var inscriptionEnabled =
      inscriptionConfig.enabled !== false &&
      Number.isFinite(Number(inscriptionConfig.price));
    var showInscription = inscriptionEnabled && inscriptionText.length > 0;
    var inscriptionAmount = showInscription
      ? Math.round(Number(inscriptionConfig.price))
      : 0;

    var lines = [
      {
        key: "cake",
        title: "Торт",
        amount: cakeAmount,
        detail:
          cakeAmount !== null
            ? formatWeight(weight) + " × " + formatMoney(pricePerKg) + "/кг"
            : "Выберите вес и начинку",
      },
      {
        key: "decor",
        title: "Декор",
        amount: decorAmount,
        detail: decor ? decor.name : "Выберите декор",
      },
    ];

    if (showInscription) {
      lines.push({
        key: "inscription",
        title: "Надпись",
        amount: inscriptionAmount,
        detail: "«" + inscriptionText + "»",
      });
    }

    var baseAmount =
      cakeAmount !== null && decorAmount !== null
        ? cakeAmount + decorAmount + inscriptionAmount
        : null;
    var discount = resolveEarlyBookingDiscount(
      source.pickupDate,
      settings,
      today
    );
    var discountAmount =
      discount && baseAmount !== null
        ? -Math.round((baseAmount * discount.percent) / 100)
        : null;
    var showDiscount =
      discountAmount !== null && discountAmount < 0 && discount !== null;

    if (showDiscount) {
      lines.push({
        key: "discount",
        title: "Скидка за ранний заказ",
        amount: discountAmount,
        detail:
          discount.percent + "% · заказ за " + formatDays(discount.days),
        percent: discount.percent,
        days: discount.days,
      });
    }

    var total =
      baseAmount !== null
        ? baseAmount + (showDiscount ? discountAmount : 0)
        : null;

    return {
      lines: lines,
      total: total,
    };
  }

  window.CakeApp.pricing = {
    formatMoney: formatMoney,
    formatWeight: formatWeight,
    formatDate: formatDate,
    formatDays: formatDays,
    getDaysBeforePickup: getDaysBeforePickup,
    toLocalISODate: toLocalISODate,
    parseLocalISODate: parseLocalISODate,
    getDateLimits: getDateLimits,
    getPickupTimeOptions: getPickupTimeOptions,
    validatePickupDate: validatePickupDate,
    validatePickupTime: validatePickupTime,
    calculatePrice: calculatePrice,
  };
})();
