/**
 * Инициализация калькулятора, состояние формы, рендер, модальные окна
 * и localStorage.
 *
 * Цены, названия и ограничения берутся только из window.CAKE_CONFIG.
 */
(function () {
  "use strict";

  window.CakeApp = window.CakeApp || {};

  var config = window.CAKE_CONFIG;
  var pricing = window.CakeApp.pricing;
  var order = window.CakeApp.order;

  if (!config || !pricing || !order) {
    return;
  }

  var NAME_MAX = 50;
  var CONTACT_MAX = 100;
  var COMMENT_MAX = 200;
  var STORAGE_VERSION = 1;
  var STORAGE_KEYS = {
    draft: "cakeConstructor:draft:v1",
    lastOrder: "cakeConstructor:lastOrder:v1",
  };
  var TOAST_DURATION = 4200;
  var COPY_RESET_DELAY = 2000;
  var FOCUSABLE_SELECTOR = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  var emptyState = function () {
    return {
      weightKg: null,
      fillingId: null,
      decorId: null,
      inscription: "",
      pickupDate: "",
      pickupTime: "",
      customerName: "",
      customerContact: "",
      customerComment: "",
    };
  };

  var state = emptyState();
  var hasSubmitted = false;
  var elements = {};
  var lastFocusedElement = null;
  var toastTimer = null;
  var copyResetTimer = null;
  var pendingDraftNotice = "";
  var visualIdCounter = 0;
  var SVG_NAMESPACE = "http://www.w3.org/2000/svg";

  var FIELD_ERROR_IDS = {
    weightKg: "weightError",
    fillingId: "fillingError",
    decorId: "decorError",
    inscription: "inscriptionError",
    pickupDate: "dateError",
    pickupTime: "pickupTimeError",
    customerName: "customerNameError",
    customerContact: "customerContactError",
    customerComment: "customerCommentError",
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function findConfigItem(items, id) {
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

  function clampText(value, maxLength) {
    if (typeof value !== "string") {
      return "";
    }
    return value.slice(0, maxLength);
  }

  function getValidDiscountTiers() {
    var discount = config.earlyBookingDiscount || {};
    if (discount.enabled === false) {
      return [];
    }

    var tiers = Array.isArray(discount.tiers) ? discount.tiers : [];
    return tiers
      .map(function (tier) {
        return {
          minDays: Number(tier && tier.minDays),
          percent: Number(tier && tier.percent),
        };
      })
      .filter(function (tier) {
        return (
          Number.isFinite(tier.minDays) &&
          Number.isFinite(tier.percent) &&
          tier.percent > 0
        );
      })
      .sort(function (a, b) {
        return a.minDays - b.minDays;
      });
  }

  /* ------------------------------------------------------------------------
     localStorage
     ------------------------------------------------------------------------ */

  function storageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function storageRemove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      // Хранилище недоступно — приложение продолжает работать без сохранения.
    }
  }

  function readJSON(key) {
    var raw = storageGet(key);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function writeJSON(key, value) {
    return storageSet(key, JSON.stringify(value));
  }

  function buildDraft() {
    return {
      version: STORAGE_VERSION,
      weightKg: state.weightKg,
      fillingId: state.fillingId,
      decorId: state.decorId,
      inscription: state.inscription,
      pickupDate: state.pickupDate,
      pickupTime: state.pickupTime,
      name: state.customerName,
      contact: state.customerContact,
      comment: state.customerComment,
      updatedAt: new Date().toISOString(),
    };
  }

  function saveDraft() {
    writeJSON(STORAGE_KEYS.draft, buildDraft());
  }

  function clearDraft() {
    storageRemove(STORAGE_KEYS.draft);
  }

  function restoreDraft() {
    var draft = readJSON(STORAGE_KEYS.draft);

    if (!draft || typeof draft !== "object") {
      return;
    }

    if (Number(draft.version) !== STORAGE_VERSION) {
      storageRemove(STORAGE_KEYS.draft);
      return;
    }

    var weightOptions = Array.isArray(config.weightOptionsKg)
      ? config.weightOptionsKg.map(Number)
      : [];
    var weight = Number(draft.weightKg);
    state.weightKg =
      Number.isFinite(weight) && weightOptions.indexOf(weight) !== -1
        ? weight
        : null;

    var fillings = Array.isArray(config.fillings) ? config.fillings : [];
    var fillingId = typeof draft.fillingId === "string" ? draft.fillingId : "";
    if (fillingId) {
      state.fillingId = findConfigItem(fillings, fillingId)
        ? fillingId
        : fillings[0]
          ? fillings[0].id
          : null;
    } else {
      state.fillingId = null;
    }

    var decor = Array.isArray(config.decor) ? config.decor : [];
    var decorId = typeof draft.decorId === "string" ? draft.decorId : "";
    if (decorId) {
      state.decorId = findConfigItem(decor, decorId)
        ? decorId
        : decor[0]
          ? decor[0].id
          : null;
    } else {
      state.decorId = null;
    }

    var inscription = config.inscription || {};
    var inscriptionMax = Number(inscription.maxLength);
    state.inscription =
      inscription.enabled === false
        ? ""
        : clampText(
            draft.inscription,
            Number.isFinite(inscriptionMax) ? inscriptionMax : 30
          );

    var pickupDate = typeof draft.pickupDate === "string" ? draft.pickupDate : "";
    if (pickupDate && !pricing.validatePickupDate(pickupDate, config).valid) {
      state.pickupDate = "";
      pendingDraftNotice =
        "Сохранённая дата больше недоступна. Выберите новую дату.";
    } else {
      state.pickupDate = pickupDate;
    }

    var pickupTime = typeof draft.pickupTime === "string" ? draft.pickupTime : "";
    state.pickupTime = pricing.validatePickupTime(pickupTime, config).valid
      ? pickupTime
      : "";

    state.customerName = clampText(draft.name, NAME_MAX);
    state.customerContact = clampText(draft.contact, CONTACT_MAX);
    state.customerComment = clampText(draft.comment, COMMENT_MAX);
  }

  function isValidLastOrder(value) {
    if (!value || typeof value !== "object") {
      return false;
    }

    if (
      !value.price ||
      !Number.isFinite(Number(value.price.total)) ||
      !value.filling ||
      !value.decor ||
      !value.customer
    ) {
      return false;
    }

    return (
      typeof value.pickupDate === "string" &&
      typeof value.pickupTime === "string"
    );
  }

  function readLastOrder() {
    var saved = readJSON(STORAGE_KEYS.lastOrder);

    if (!saved) {
      return null;
    }

    if (!isValidLastOrder(saved)) {
      storageRemove(STORAGE_KEYS.lastOrder);
      return null;
    }

    return saved;
  }

  function saveLastOrder(orderData) {
    writeJSON(STORAGE_KEYS.lastOrder, orderData);
    refreshLastOrderLink();
  }

  function refreshLastOrderLink() {
    if (!elements.openLastOrderButton) {
      return;
    }
    elements.openLastOrderButton.hidden = !readLastOrder();
  }

  /* ------------------------------------------------------------------------
     Элементы
     ------------------------------------------------------------------------ */

  function getFieldInputs(field) {
    switch (field) {
      case "weightKg":
        return Array.prototype.slice.call(
          elements.weightOptions.querySelectorAll('input[type="radio"]')
        );
      case "fillingId":
        return Array.prototype.slice.call(
          elements.fillingOptions.querySelectorAll('input[type="radio"]')
        );
      case "decorId":
        return Array.prototype.slice.call(
          elements.decorOptions.querySelectorAll('input[type="radio"]')
        );
      case "inscription":
        return [elements.inscription];
      case "pickupDate":
        return [elements.pickupDate];
      case "pickupTime":
        return [elements.pickupTime];
      case "customerName":
        return [elements.customerName];
      case "customerContact":
        return [elements.customerContact];
      case "customerComment":
        return [elements.customerComment];
      default:
        return [];
    }
  }

  function collectElements() {
    return {
      form: byId("cakeForm"),
      weightOptions: byId("weightOptions"),
      fillingOptions: byId("fillingOptions"),
      decorOptions: byId("decorOptions"),
      inscriptionSection: byId("inscriptionSection"),
      inscription: byId("inscription"),
      inscriptionHint: byId("inscriptionHint"),
      inscriptionCount: byId("inscriptionCount"),
      pickupDate: byId("pickupDate"),
      dateHint: byId("dateHint"),
      discountHint: byId("discountHint"),
      pickupTime: byId("pickupTime"),
      pickupTimeHint: byId("pickupTimeHint"),
      customerName: byId("customerName"),
      customerContact: byId("customerContact"),
      customerComment: byId("customerComment"),
      commentCount: byId("commentCount"),
      summarySelection: byId("summarySelection"),
      summaryDisclaimer: byId("summaryDisclaimer"),
      totalPrice: byId("totalPrice"),
      stickyTotal: byId("stickyTotal"),
      formErrors: byId("formErrors"),
      formErrorsList: byId("formErrorsList"),
      priceNodes: {
        cake: document.querySelector('[data-price="cake"]'),
        decor: document.querySelector('[data-price="decor"]'),
        inscription: document.querySelector('[data-price="inscription"]'),
        discount: document.querySelector('[data-price="discount"]'),
      },
      detailNodes: {
        cake: document.querySelector('[data-price-detail="cake"]'),
        decor: document.querySelector('[data-price-detail="decor"]'),
        discount: document.querySelector('[data-price-detail="discount"]'),
      },
      lineNodes: {
        inscription: document.querySelector('[data-line="inscription"]'),
        discount: document.querySelector('[data-line="discount"]'),
      },
      orderDialog: byId("orderDialog"),
      orderCardText: byId("orderCardText"),
      copyOrderButton: byId("copyOrderButton"),
      copyStatus: byId("copyStatus"),
      resetOrderButton: byId("resetOrderButton"),
      catalogDialog: byId("catalogDialog"),
      catalogGrid: byId("catalogGrid"),
      openCatalogButtons: Array.prototype.slice.call(
        document.querySelectorAll("[data-open-catalog]")
      ),
      decorDialog: byId("decorDialog"),
      decorGrid: byId("decorGrid"),
      openDecorCatalogButtons: Array.prototype.slice.call(
        document.querySelectorAll("[data-open-decor-catalog]")
      ),
      pricesDialog: byId("pricesDialog"),
      pricesFillingsBody: byId("pricesFillingsBody"),
      pricesDecorBody: byId("pricesDecorBody"),
      pricesConditions: byId("pricesConditions"),
      pricesDisclaimer: byId("pricesDisclaimer"),
      clearDialog: byId("clearDialog"),
      clearCancelButton: byId("clearCancelButton"),
      confirmClearButton: byId("confirmClearButton"),
      clearDataButton: byId("clearDataButton"),
      openLastOrderButton: byId("openLastOrderButton"),
      openPricesButtons: Array.prototype.slice.call(
        document.querySelectorAll("[data-open-prices]")
      ),
      dialogs: Array.prototype.slice.call(document.querySelectorAll("dialog")),
      toast: byId("toast"),
    };
  }

  /* ------------------------------------------------------------------------
     Рендер вариантов
     ------------------------------------------------------------------------ */

  function createRadioCard(options) {
    var label = document.createElement("label");
    label.className =
      "option-card" + (options.compact ? " option-card--weight" : "");
    if (options.checked) {
      label.classList.add("is-selected");
    }

    var input = document.createElement("input");
    input.className = "option-card__input";
    input.type = "radio";
    input.name = options.name;
    input.value = options.value;
    input.checked = Boolean(options.checked);
    if (options.describedBy) {
      input.setAttribute("aria-describedby", options.describedBy);
    }

    var body = document.createElement("span");
    body.className = "option-card__body";

    if (options.compact) {
      var compactTitle = document.createElement("span");
      compactTitle.className = "option-card__title";
      compactTitle.textContent = options.title;
      body.appendChild(compactTitle);
    } else {
      if (options.visual) {
        body.appendChild(options.visual);
      }

      var main = document.createElement("span");
      main.className = "option-card__main";

      var title = document.createElement("span");
      title.className = "option-card__title";
      title.textContent = options.title;
      main.appendChild(title);

      if (options.description) {
        var description = document.createElement("span");
        description.className = "option-card__description";
        description.textContent = options.description;
        main.appendChild(description);
      }

      body.appendChild(main);

      var aside = document.createElement("span");
      aside.className = "option-card__aside";

      var price = document.createElement("span");
      price.className = "option-card__price";
      price.textContent = options.price;
      aside.appendChild(price);

      var marker = document.createElement("span");
      marker.className = "option-card__marker";
      marker.setAttribute("aria-hidden", "true");
      aside.appendChild(marker);

      body.appendChild(aside);
    }

    label.appendChild(input);
    label.appendChild(body);
    return label;
  }

  function renderWeightOptions() {
    var fragment = document.createDocumentFragment();
    var options = Array.isArray(config.weightOptionsKg)
      ? config.weightOptionsKg
      : [];

    options.forEach(function (weight) {
      fragment.appendChild(
        createRadioCard({
          compact: true,
          name: "weightKg",
          value: String(weight),
          title: pricing.formatWeight(weight),
          checked: state.weightKg === Number(weight),
          describedBy: "weightHint weightError",
        })
      );
    });

    elements.weightOptions.replaceChildren(fragment);
    syncSelectionClasses(elements.weightOptions);
  }

  function renderFillingOptions() {
    var fragment = document.createDocumentFragment();
    var fillings = Array.isArray(config.fillings) ? config.fillings : [];

    fillings.forEach(function (filling) {
      fragment.appendChild(
        createRadioCard({
          name: "fillingId",
          value: filling.id,
          title: filling.name,
          description: filling.description,
          price: pricing.formatMoney(filling.pricePerKg) + "/кг",
          visual: createFillingVisual(filling, "option-card__visual"),
          checked: state.fillingId === filling.id,
          describedBy: "fillingHint fillingError",
        })
      );
    });

    elements.fillingOptions.replaceChildren(fragment);
    syncSelectionClasses(elements.fillingOptions);
  }

  /* ------------------------------------------------------------------------
     Каталог начинок и декора: локальные SVG-иллюстрации без внешних запросов
     ------------------------------------------------------------------------ */

  function createSvgElement(name, attributes) {
    var element = document.createElementNS(SVG_NAMESPACE, name);
    Object.keys(attributes).forEach(function (attribute) {
      element.setAttribute(attribute, String(attributes[attribute]));
    });
    return element;
  }

  function createGradientDefs(defs, gradientId, from, to) {
    var gradient = document.createElementNS(SVG_NAMESPACE, "linearGradient");
    gradient.setAttribute("id", gradientId);
    gradient.setAttribute("x1", "0");
    gradient.setAttribute("y1", "0");
    gradient.setAttribute("x2", "0.4");
    gradient.setAttribute("y2", "1");

    var stopFrom = document.createElementNS(SVG_NAMESPACE, "stop");
    stopFrom.setAttribute("offset", "0");
    stopFrom.setAttribute("stop-color", from);

    var stopTo = document.createElementNS(SVG_NAMESPACE, "stop");
    stopTo.setAttribute("offset", "1");
    stopTo.setAttribute("stop-color", to);

    gradient.appendChild(stopFrom);
    gradient.appendChild(stopTo);
    defs.appendChild(gradient);
  }

  /**
   * Начинка поверх среза: сюжет зависит от visual.style.
   * Цвета берутся из конфига, поэтому новые начинки не требуют правок кода.
   */
  function drawFillingTopping(svg, style, colors) {
    var from = colors.from;
    var to = colors.to;
    var accent = colors.accent;

    if (style === "chocolate") {
      // Шоколадная плитка и волнистые потёки глазури.
      svg.appendChild(
        createSvgElement("rect", {
          x: 27,
          y: 12,
          width: 10,
          height: 8,
          rx: 2,
          fill: accent,
        })
      );
      svg.appendChild(
        createSvgElement("rect", {
          x: 28.6,
          y: 13.6,
          width: 6.8,
          height: 1.8,
          rx: 0.9,
          fill: from,
          opacity: 0.5,
        })
      );
      svg.appendChild(
        createSvgElement("path", {
          d: "M16 24 q3.5 7 7 0 q3.5 -7 7 0 q3.5 7 7 0 q3.5 -7 7 0",
          fill: "none",
          stroke: accent,
          "stroke-width": 1.8,
          "stroke-linecap": "round",
        })
      );
      return;
    }

    if (style === "berry") {
      // Ягоды с бликами, листиком и крошкой на тарелке.
      svg.appendChild(
        createSvgElement("circle", { cx: 25.5, cy: 18, r: 4.2, fill: accent })
      );
      svg.appendChild(
        createSvgElement("circle", { cx: 35, cy: 16.5, r: 4.9, fill: accent })
      );
      svg.appendChild(
        createSvgElement("circle", {
          cx: 24.4,
          cy: 16.6,
          r: 1.3,
          fill: "#ffffff",
          opacity: 0.6,
        })
      );
      svg.appendChild(
        createSvgElement("circle", {
          cx: 33.7,
          cy: 15,
          r: 1.5,
          fill: "#ffffff",
          opacity: 0.6,
        })
      );
      svg.appendChild(
        createSvgElement("path", {
          d: "M35 11.4 q4.2 -2.8 6.2 0.6 q-4.2 2.6 -6.2 -0.6 z",
          fill: to,
        })
      );
      [
        [18, 53],
        [45, 52],
      ].forEach(function (point) {
        svg.appendChild(
          createSvgElement("circle", {
            cx: point[0],
            cy: point[1],
            r: 1.2,
            fill: accent,
            opacity: 0.5,
          })
        );
      });
      return;
    }

    if (style === "caramel") {
      // Карамельные потёки и завиток.
      [20, 30, 40].forEach(function (x) {
        svg.appendChild(
          createSvgElement("rect", {
            x: x,
            y: 22,
            width: 4,
            height: 9,
            rx: 2,
            fill: accent,
          })
        );
      });
      svg.appendChild(
        createSvgElement("circle", { cx: 32, cy: 16, r: 5.2, fill: accent })
      );
      svg.appendChild(
        createSvgElement("circle", {
          cx: 32,
          cy: 16,
          r: 2.2,
          fill: from,
          opacity: 0.7,
        })
      );
      return;
    }

    if (style === "nut") {
      // Фисташки с ядрышком и крошка на тарелке.
      svg.appendChild(
        createSvgElement("ellipse", { cx: 25, cy: 17, rx: 4, ry: 5.2, fill: accent })
      );
      svg.appendChild(
        createSvgElement("ellipse", {
          cx: 36,
          cy: 18.5,
          rx: 4,
          ry: 5.2,
          fill: accent,
          transform: "rotate(18 36 18.5)",
        })
      );
      svg.appendChild(
        createSvgElement("ellipse", {
          cx: 25,
          cy: 17,
          rx: 1.6,
          ry: 2.6,
          fill: from,
          opacity: 0.7,
        })
      );
      svg.appendChild(
        createSvgElement("ellipse", {
          cx: 36,
          cy: 18.5,
          rx: 1.6,
          ry: 2.6,
          fill: from,
          opacity: 0.7,
          transform: "rotate(18 36 18.5)",
        })
      );
      [
        [18, 53],
        [44, 52],
        [30, 54],
      ].forEach(function (point) {
        svg.appendChild(
          createSvgElement("circle", {
            cx: point[0],
            cy: point[1],
            r: 1.1,
            fill: accent,
            opacity: 0.5,
          })
        );
      });
      return;
    }

    // Сливки: двухцветный завиток крема (стиль по умолчанию и «cream»).
    [
      [26, 20, 4.6],
      [38, 20, 4.6],
      [32, 15, 5.6],
    ].forEach(function (dollop) {
      svg.appendChild(
        createSvgElement("circle", {
          cx: dollop[0],
          cy: dollop[1],
          r: dollop[2],
          fill: to,
        })
      );
    });
    [
      [25.4, 19.2, 3.5],
      [37.4, 19.2, 3.5],
      [31.4, 14.2, 4.4],
    ].forEach(function (dollop) {
      svg.appendChild(
        createSvgElement("circle", {
          cx: dollop[0],
          cy: dollop[1],
          r: dollop[2],
          fill: from,
        })
      );
    });
    svg.appendChild(
      createSvgElement("circle", {
        cx: 32,
        cy: 10.4,
        r: 2,
        fill: accent,
        opacity: 0.85,
      })
    );
  }

  /**
   * Инлайн-SVG иллюстрация начинки: срез торта со слоями бисквита и крема
   * и характерной начинкой сверху. Цвета — из config.filling.visual.
   * Никаких фотографий, внешних файлов и сетевых запросов.
   */
  function createFillingVisual(filling, className) {
    var visual = (filling && filling.visual) || {};
    var style = visual.style || "cream";
    var from = visual.from || "#f2e6d8";
    var to = visual.to || "#d9c4ad";
    var accent = visual.accent || "#a98963";
    var baseId = filling && filling.id ? filling.id : "filling";

    visualIdCounter += 1;
    var gradientId = "filling-grad-" + baseId + "-" + visualIdCounter;

    var wrapper = document.createElement("span");
    wrapper.className = className || "filling-visual";
    wrapper.setAttribute("aria-hidden", "true");

    var svg = document.createElementNS(SVG_NAMESPACE, "svg");
    svg.setAttribute("viewBox", "0 0 64 64");
    svg.setAttribute("focusable", "false");

    var defs = document.createElementNS(SVG_NAMESPACE, "defs");
    createGradientDefs(defs, gradientId, from, "#fdf7f0");
    svg.appendChild(defs);

    // Мягкий фон в цвете начинки и тарелка.
    svg.appendChild(
      createSvgElement("rect", {
        width: 64,
        height: 64,
        rx: 16,
        fill: "url(#" + gradientId + ")",
      })
    );
    svg.appendChild(
      createSvgElement("ellipse", {
        cx: 32,
        cy: 55,
        rx: 24,
        ry: 3.2,
        fill: "#e9ddd0",
      })
    );

    // Срез торта: бисквит — крем — бисквит, сверху кремовая шапка.
    svg.appendChild(
      createSvgElement("rect", { x: 13, y: 43, width: 38, height: 9, rx: 2, fill: to })
    );
    svg.appendChild(
      createSvgElement("rect", { x: 13, y: 37, width: 38, height: 6, fill: from })
    );
    svg.appendChild(
      createSvgElement("rect", { x: 13, y: 29, width: 38, height: 8, rx: 2, fill: to })
    );
    svg.appendChild(
      createSvgElement("rect", { x: 12, y: 23, width: 40, height: 7, rx: 3.5, fill: from })
    );
    svg.appendChild(
      createSvgElement("rect", {
        x: 14,
        y: 29,
        width: 2.4,
        height: 22,
        rx: 1.2,
        fill: "#ffffff",
        opacity: 0.22,
      })
    );

    drawFillingTopping(svg, style, { from: from, to: to, accent: accent });

    wrapper.appendChild(svg);
    return wrapper;
  }

  function drawDecorMinimal(svg, accent) {
    svg.appendChild(
      createSvgElement("rect", {
        x: 19,
        y: 44,
        width: 26,
        height: 1.6,
        rx: 0.8,
        fill: accent,
        opacity: 0.75,
      })
    );

    [23, 32, 41].forEach(function (cx) {
      svg.appendChild(
        createSvgElement("circle", {
          cx: cx,
          cy: 50,
          r: 1.7,
          fill: accent,
        })
      );
    });

    // Веточка с двумя листиками по краям линии.
    [
      { x: 17, y: 43, rotate: -35 },
      { x: 47, y: 43, rotate: 35 },
    ].forEach(function (leaf) {
      svg.appendChild(
        createSvgElement("ellipse", {
          cx: leaf.x,
          cy: leaf.y,
          rx: 2.6,
          ry: 1.3,
          fill: accent,
          opacity: 0.6,
          transform: "rotate(" + leaf.rotate + " " + leaf.x + " " + leaf.y + ")",
        })
      );
    });
  }

  function drawDecorThemed(svg, accent) {
    svg.appendChild(
      createSvgElement("path", {
        d: "M12 17 Q30 26 46 17",
        fill: "none",
        stroke: accent,
        "stroke-width": 1.6,
        "stroke-linecap": "round",
      })
    );

    [
      { x: 15, y: 19 },
      { x: 22, y: 21.8 },
      { x: 31, y: 21.8 },
      { x: 38, y: 19 },
    ].forEach(function (flag) {
      svg.appendChild(
        createSvgElement("polygon", {
          points:
            flag.x +
            "," +
            flag.y +
            " " +
            (flag.x + 5) +
            "," +
            flag.y +
            " " +
            (flag.x + 2.5) +
            "," +
            (flag.y + 5),
          fill: accent,
        })
      );
    });

    svg.appendChild(
      createSvgElement("circle", {
        cx: 54,
        cy: 15,
        r: 5,
        fill: accent,
        opacity: 0.85,
      })
    );

    // Ниточка и второй, меньший шарик.
    svg.appendChild(
      createSvgElement("path", {
        d: "M54 20 q-1 4 0 7",
        fill: "none",
        stroke: accent,
        "stroke-width": 1.1,
        "stroke-linecap": "round",
        opacity: 0.75,
      })
    );
    svg.appendChild(
      createSvgElement("circle", {
        cx: 46.5,
        cy: 11,
        r: 3.4,
        fill: accent,
        opacity: 0.6,
      })
    );
    svg.appendChild(
      createSvgElement("path", {
        d: "M46.5 14.4 q-0.6 2.6 0.4 4.4",
        fill: "none",
        stroke: accent,
        "stroke-width": 1,
        "stroke-linecap": "round",
        opacity: 0.6,
      })
    );

    [
      [22, 42],
      [40, 44],
      [28, 51],
      [44, 52],
    ].forEach(function (dot) {
      svg.appendChild(
        createSvgElement("circle", {
          cx: dot[0],
          cy: dot[1],
          r: 1.6,
          fill: accent,
          opacity: 0.65,
        })
      );
    });
  }

  function drawDecorFigures(svg, accent, from) {
    // Мишка-фигурка слева.
    svg.appendChild(
      createSvgElement("circle", {
        cx: 18.8,
        cy: 9.5,
        r: 2.6,
        fill: accent,
      })
    );
    svg.appendChild(
      createSvgElement("circle", {
        cx: 29.2,
        cy: 9.5,
        r: 2.6,
        fill: accent,
      })
    );
    svg.appendChild(
      createSvgElement("circle", {
        cx: 18.8,
        cy: 9.5,
        r: 1.2,
        fill: from,
        opacity: 0.8,
      })
    );
    svg.appendChild(
      createSvgElement("circle", {
        cx: 29.2,
        cy: 9.5,
        r: 1.2,
        fill: from,
        opacity: 0.8,
      })
    );
    svg.appendChild(
      createSvgElement("ellipse", {
        cx: 24,
        cy: 27,
        rx: 6,
        ry: 7,
        fill: accent,
      })
    );
    svg.appendChild(
      createSvgElement("circle", {
        cx: 24,
        cy: 15,
        r: 6.5,
        fill: accent,
      })
    );
    svg.appendChild(
      createSvgElement("ellipse", {
        cx: 24,
        cy: 17.5,
        rx: 3.2,
        ry: 2.4,
        fill: "#ffffff",
        opacity: 0.85,
      })
    );
    svg.appendChild(
      createSvgElement("circle", {
        cx: 24,
        cy: 16.8,
        r: 1,
        fill: from,
      })
    );
    svg.appendChild(
      createSvgElement("circle", {
        cx: 21.3,
        cy: 13.6,
        r: 0.9,
        fill: from,
      })
    );
    svg.appendChild(
      createSvgElement("circle", {
        cx: 26.7,
        cy: 13.6,
        r: 0.9,
        fill: from,
      })
    );

    // Звёздочка-фигурка справа.
    svg.appendChild(
      createSvgElement("polygon", {
        points:
          "45,14 46.53,17.9 50.71,18.15 47.47,20.8 48.53,24.85 45,22.6 " +
          "41.47,24.85 42.53,20.8 39.29,18.15 43.47,17.9",
        fill: accent,
      })
    );

    // Маленькое сердечко между фигурками.
    svg.appendChild(
      createSvgElement("path", {
        d:
          "M34 12.4 C32.7 10.7 30.9 11 30.9 12.4 C30.9 13.7 34 15.7 34 15.7 " +
          "C34 15.7 37.1 13.7 37.1 12.4 C37.1 11 35.3 10.7 34 12.4 Z",
        fill: accent,
        opacity: 0.9,
      })
    );
  }

  /**
   * Инлайн-SVG иллюстрация декора: тортик и элементы, которые показывают,
   * что входит в каждый вариант. Никаких фотографий и сетевых запросов.
   */
  function createDecorVisual(item, className) {
    var visual = (item && item.visual) || {};
    var style = visual.style || "none";
    var from = visual.from || "#fbf1e6";
    var to = visual.to || "#e3cbb0";
    var accent = visual.accent || "#c9a887";
    var baseId = item && item.id ? item.id : "decor";

    visualIdCounter += 1;
    var gradientId = "decor-grad-" + baseId + "-" + visualIdCounter;

    var wrapper = document.createElement("span");
    wrapper.className = className || "decor-visual";
    wrapper.setAttribute("aria-hidden", "true");

    var svg = document.createElementNS(SVG_NAMESPACE, "svg");
    svg.setAttribute("viewBox", "0 0 64 64");
    svg.setAttribute("focusable", "false");

    var defs = document.createElementNS(SVG_NAMESPACE, "defs");
    createGradientDefs(defs, gradientId, from, to);
    svg.appendChild(defs);

    // Мягкая подложка, тарелка и корпус торта.
    svg.appendChild(
      createSvgElement("rect", {
        width: 64,
        height: 64,
        rx: 16,
        fill: "#fdf7f0",
      })
    );
    svg.appendChild(
      createSvgElement("ellipse", {
        cx: 32,
        cy: 58,
        rx: 25,
        ry: 3.5,
        fill: "#e7dcd0",
      })
    );
    svg.appendChild(
      createSvgElement("rect", {
        x: 11,
        y: 33,
        width: 42,
        height: 24,
        rx: 5,
        fill: "url(#" + gradientId + ")",
      })
    );
    svg.appendChild(
      createSvgElement("ellipse", {
        cx: 32,
        cy: 33,
        rx: 21,
        ry: 6,
        fill: from,
      })
    );

    if (style === "minimal") {
      drawDecorMinimal(svg, accent);
    } else if (style === "themed") {
      drawDecorThemed(svg, accent);
    } else if (style === "figures") {
      drawDecorFigures(svg, accent, from);
    } else {
      svg.appendChild(
        createSvgElement("rect", {
          x: 17,
          y: 40,
          width: 30,
          height: 3,
          rx: 1.5,
          fill: "#ffffff",
          opacity: 0.45,
        })
      );
    }

    wrapper.appendChild(svg);
    return wrapper;
  }

  function findRadioInput(container, name, value) {
    if (!container) {
      return null;
    }

    var inputs = container.querySelectorAll('input[type="radio"]');
    for (var index = 0; index < inputs.length; index += 1) {
      if (inputs[index].name === name && inputs[index].value === String(value)) {
        return inputs[index];
      }
    }
    return null;
  }

  function updateCatalogSelection(grid, dataAttr, selectedId) {
    if (!grid) {
      return;
    }

    Array.prototype.forEach.call(
      grid.querySelectorAll(".catalog-card"),
      function (card) {
        var selected = card.getAttribute(dataAttr) === selectedId;
        card.classList.toggle("is-selected", selected);
        card.setAttribute("aria-pressed", selected ? "true" : "false");
      }
    );
  }

  function chooseCatalogItem(container, field, id, dialog) {
    var input = findRadioInput(container, field, id);
    if (!input) {
      return;
    }

    input.checked = true;
    state[field] = id;
    syncSelectionClasses(container);
    handleStateChange();
    closeDialog(dialog);
  }

  function createCatalogCard(options) {
    var card = document.createElement("button");
    card.type = "button";
    card.className = "catalog-card";
    card.setAttribute(options.dataAttr, options.id);
    card.appendChild(options.visual);

    var title = document.createElement("span");
    title.className = "catalog-card__title";
    title.textContent = options.title;
    card.appendChild(title);

    var price = document.createElement("span");
    price.className = "catalog-card__price";
    price.textContent = options.price;
    card.appendChild(price);

    if (options.description) {
      var description = document.createElement("span");
      description.className = "catalog-card__description";
      description.textContent = options.description;
      card.appendChild(description);
    }

    card.addEventListener("click", function () {
      options.onSelect();
    });

    return card;
  }

  function renderCatalogGrid(options) {
    if (!options.grid) {
      return;
    }

    var items = Array.isArray(options.items) ? options.items : [];
    var fragment = document.createDocumentFragment();

    items.forEach(function (item) {
      fragment.appendChild(
        createCatalogCard({
          dataAttr: options.dataAttr,
          id: item.id,
          visual: options.createVisual(item, "catalog-card__visual"),
          title: item.name,
          price: options.priceLabel(item),
          description: item.description,
          onSelect: function () {
            chooseCatalogItem(
              options.container,
              options.field,
              item.id,
              options.dialog
            );
          },
        })
      );
    });

    options.grid.replaceChildren(fragment);
    updateCatalogSelection(options.grid, options.dataAttr, state[options.field]);
  }

  function renderFillingCatalog() {
    renderCatalogGrid({
      grid: elements.catalogGrid,
      items: config.fillings,
      dataAttr: "data-filling-id",
      container: elements.fillingOptions,
      field: "fillingId",
      dialog: elements.catalogDialog,
      createVisual: createFillingVisual,
      priceLabel: function (item) {
        return pricing.formatMoney(item.pricePerKg) + "/кг";
      },
    });
  }

  function renderDecorCatalog() {
    renderCatalogGrid({
      grid: elements.decorGrid,
      items: config.decor,
      dataAttr: "data-decor-id",
      container: elements.decorOptions,
      field: "decorId",
      dialog: elements.decorDialog,
      createVisual: createDecorVisual,
      priceLabel: function (item) {
        return pricing.formatMoney(item.price);
      },
    });
  }

  function renderDecorOptions() {
    var fragment = document.createDocumentFragment();
    var decor = Array.isArray(config.decor) ? config.decor : [];

    decor.forEach(function (item) {
      fragment.appendChild(
        createRadioCard({
          name: "decorId",
          value: item.id,
          title: item.name,
          description: item.description,
          price: pricing.formatMoney(item.price),
          visual: createDecorVisual(item, "option-card__visual"),
          checked: state.decorId === item.id,
          describedBy: "decorHint decorError",
        })
      );
    });

    elements.decorOptions.replaceChildren(fragment);
    syncSelectionClasses(elements.decorOptions);
  }

  function renderPickupTimes() {
    var options = pricing.getPickupTimeOptions(config);
    var select = elements.pickupTime;

    while (select.options.length > 1) {
      select.remove(1);
    }

    var fragment = document.createDocumentFragment();
    options.forEach(function (time) {
      var option = document.createElement("option");
      option.value = time;
      option.textContent = time;
      fragment.appendChild(option);
    });

    select.appendChild(fragment);
    select.value = options.indexOf(state.pickupTime) !== -1 ? state.pickupTime : "";
  }

  function refreshDateLimits() {
    var limits = pricing.getDateLimits(config);
    elements.pickupDate.min = limits.minDate;
    elements.pickupDate.max = limits.maxDate;
    elements.dateHint.textContent =
      "Доступные даты: с " +
      pricing.formatDate(limits.minDate) +
      " по " +
      pricing.formatDate(limits.maxDate) +
      ".";
  }

  function renderDiscountHint() {
    var hint = elements.discountHint;
    if (!hint) {
      return;
    }

    var validTiers = getValidDiscountTiers();

    if (!validTiers.length) {
      hint.textContent = "";
      hint.hidden = true;
      return;
    }

    var parts = validTiers.map(function (tier) {
      return (
        tier.percent + "% — за " + pricing.formatDays(tier.minDays)
      );
    });

    hint.textContent = "Скидка за ранний заказ: " + parts.join(", ") + ".";
    hint.hidden = false;
  }

  function applyConfig() {
    var inscription = config.inscription || {};
    var inscriptionMax = Number(inscription.maxLength);
    var pickup = config.pickup || {};

    if (inscription.enabled === false) {
      elements.inscriptionSection.hidden = true;
      state.inscription = "";
    } else if (Number.isFinite(inscriptionMax)) {
      elements.inscription.maxLength = inscriptionMax;
      elements.inscriptionHint.textContent =
        "До " +
        inscriptionMax +
        " символов. Стоимость — " +
        pricing.formatMoney(inscription.price) +
        ".";
    }

    elements.customerName.maxLength = NAME_MAX;
    elements.customerContact.maxLength = CONTACT_MAX;
    elements.customerComment.maxLength = COMMENT_MAX;
    elements.summaryDisclaimer.textContent = config.disclaimer || "";

    if (pickup.from && pickup.to) {
      var timeHint = "Самовывоз с " + pickup.from + " до " + pickup.to + ".";
      if (pickup.address) {
        timeHint += " Адрес: " + pickup.address + ".";
      }
      elements.pickupTimeHint.textContent = timeHint;
    }

    refreshDateLimits();
    renderDiscountHint();
  }

  function syncSelectionClasses(container) {
    Array.prototype.forEach.call(
      container.querySelectorAll(".option-card"),
      function (card) {
        var input = card.querySelector(".option-card__input");
        card.classList.toggle("is-selected", Boolean(input && input.checked));
      }
    );
  }

  function applyRestoredValues() {
    elements.inscription.value = state.inscription;
    elements.pickupDate.value = state.pickupDate;
    elements.pickupTime.value = state.pickupTime;
    elements.customerName.value = state.customerName;
    elements.customerContact.value = state.customerContact;
    elements.customerComment.value = state.customerComment;
  }

  /* ------------------------------------------------------------------------
     Итог и валидация
     ------------------------------------------------------------------------ */

  function getSelection() {
    return {
      weightKg: state.weightKg,
      fillingId: state.fillingId,
      decorId: state.decorId,
      inscription: state.inscription,
      pickupDate: state.pickupDate,
      pickupTime: state.pickupTime,
      customerName: state.customerName,
      customerContact: state.customerContact,
      customerComment: state.customerComment,
    };
  }

  function buildSelectionSummary(selection) {
    var parts = [];
    var filling = findConfigItem(config.fillings, selection.fillingId);
    var decor = findConfigItem(config.decor, selection.decorId);

    if (selection.weightKg !== null && selection.weightKg !== undefined) {
      parts.push(pricing.formatWeight(selection.weightKg));
    }
    if (filling) {
      parts.push(filling.name);
    }
    if (decor) {
      parts.push(decor.name);
    }

    return parts.length ? parts.join(" · ") : "Пока ничего не выбрано";
  }

  function renderPriceLine(key, line) {
    var priceNode = elements.priceNodes[key];
    var detailNode = elements.detailNodes[key];
    var lineNode = elements.lineNodes[key];

    if (key === "inscription" || key === "discount") {
      if (!line) {
        if (lineNode) {
          lineNode.hidden = true;
        }
        return;
      }
      if (lineNode) {
        lineNode.hidden = false;
      }
    }

    if (!priceNode) {
      return;
    }

    if (!line) {
      priceNode.textContent = "—";
      return;
    }

    if (detailNode) {
      detailNode.textContent = line.detail || "";
    }

    priceNode.textContent =
      line.amount === null || line.amount === undefined
        ? "—"
        : pricing.formatMoney(line.amount);
  }

  function updateSummary() {
    var selection = getSelection();
    var price = pricing.calculatePrice(selection, config);
    var lines = {};

    price.lines.forEach(function (line) {
      lines[line.key] = line;
    });

    renderPriceLine("cake", lines.cake);
    renderPriceLine("decor", lines.decor);
    renderPriceLine("inscription", lines.inscription);
    renderPriceLine("discount", lines.discount);

    var totalText =
      price.total === null ? "—" : pricing.formatMoney(price.total);
    elements.totalPrice.textContent = totalText;
    elements.stickyTotal.textContent = totalText;
    elements.summarySelection.textContent = buildSelectionSummary(selection);
  }

  function updateCounters() {
    var inscriptionMax = Number((config.inscription || {}).maxLength);
    var inscriptionLength = elements.inscription
      ? elements.inscription.value.length
      : 0;
    var commentLength = elements.customerComment
      ? elements.customerComment.value.length
      : 0;

    if (Number.isFinite(inscriptionMax)) {
      elements.inscriptionCount.textContent =
        inscriptionLength + " / " + inscriptionMax;
    }

    elements.commentCount.textContent = commentLength + " / " + COMMENT_MAX;
  }

  function renderValidation(validation, focusFirst) {
    var errors = validation.errors || [];
    var errorsByField = {};

    errors.forEach(function (error) {
      errorsByField[error.field] = error.message;
    });

    Object.keys(FIELD_ERROR_IDS).forEach(function (field) {
      var errorNode = byId(FIELD_ERROR_IDS[field]);
      var inputs = getFieldInputs(field);
      var message = errorsByField[field] || "";

      if (errorNode) {
        errorNode.textContent = message;
        errorNode.hidden = !message;
      }

      inputs.forEach(function (input) {
        if (!input) {
          return;
        }
        if (message) {
          input.setAttribute("aria-invalid", "true");
        } else {
          input.removeAttribute("aria-invalid");
        }
      });
    });

    if (errors.length) {
      elements.formErrors.hidden = false;
      elements.formErrorsList.replaceChildren();
      errors.forEach(function (error) {
        var item = document.createElement("li");
        item.textContent = error.message;
        elements.formErrorsList.appendChild(item);
      });
    } else {
      elements.formErrors.hidden = true;
      elements.formErrorsList.replaceChildren();
    }

    if (focusFirst && errors.length) {
      var targets = getFieldInputs(errors[0].field);
      if (targets.length && targets[0]) {
        targets[0].focus();
      }
    }
  }

  /* ------------------------------------------------------------------------
     Уведомления и модальные окна
     ------------------------------------------------------------------------ */

  function showToast(message) {
    var toast = elements.toast;
    if (!toast) {
      return;
    }

    toast.textContent = message;
    toast.classList.add("is-visible");

    if (typeof toast.showPopover === "function") {
      try {
        if (!toast.matches(":popover-open")) {
          toast.showPopover();
        }
      } catch (error) {
        // Popover не поддерживается — остаётся обычное уведомление.
      }
    }

    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.classList.remove("is-visible");
      if (typeof toast.hidePopover === "function") {
        try {
          if (toast.matches(":popover-open")) {
            toast.hidePopover();
          }
        } catch (error) {
          // Ничего страшного: уведомление скрыто классом.
        }
      }
    }, TOAST_DURATION);
  }

  function getFocusable(dialog) {
    return Array.prototype.slice
      .call(dialog.querySelectorAll(FOCUSABLE_SELECTOR))
      .filter(function (element) {
        return (
          !element.hasAttribute("hidden") &&
          element.getClientRects().length > 0
        );
      });
  }

  function openDialog(dialog, initialFocus) {
    if (!dialog || typeof dialog.showModal !== "function") {
      return;
    }

    lastFocusedElement = document.activeElement;
    if (!dialog.open) {
      dialog.showModal();
    }
    document.documentElement.classList.add("has-dialog");

    var target =
      initialFocus ||
      getFocusable(dialog)[0] ||
      dialog;

    if (target && typeof target.focus === "function") {
      target.focus();
    }
  }

  function closeDialog(dialog) {
    if (dialog && dialog.open) {
      dialog.close();
    }
  }

  function handleDialogClose() {
    if (lastFocusedElement && document.contains(lastFocusedElement)) {
      lastFocusedElement.focus();
    }
    lastFocusedElement = null;

    var hasOpenDialog = elements.dialogs.some(function (dialog) {
      return dialog.open;
    });
    if (!hasOpenDialog) {
      document.documentElement.classList.remove("has-dialog");
    }
  }

  function trapFocus(dialog, event) {
    if (event.key !== "Tab") {
      return;
    }

    var focusable = getFocusable(dialog);
    if (!focusable.length) {
      event.preventDefault();
      return;
    }

    var first = focusable[0];
    var last = focusable[focusable.length - 1];

    if (event.shiftKey) {
      if (
        document.activeElement === first ||
        !dialog.contains(document.activeElement)
      ) {
        event.preventDefault();
        last.focus();
      }
    } else if (
      document.activeElement === last ||
      !dialog.contains(document.activeElement)
    ) {
      event.preventDefault();
      first.focus();
    }
  }

  function bindDialog(dialog) {
    if (!dialog) {
      return;
    }

    dialog.addEventListener("close", handleDialogClose);
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) {
        closeDialog(dialog);
      }
    });
    dialog.addEventListener("keydown", function (event) {
      trapFocus(dialog, event);
    });

    Array.prototype.forEach.call(
      dialog.querySelectorAll("[data-close-dialog]"),
      function (button) {
        button.addEventListener("click", function () {
          closeDialog(dialog);
        });
      }
    );
  }

  /* ------------------------------------------------------------------------
     Карточка заказа
     ------------------------------------------------------------------------ */

  function setCopyStatus(message, isError) {
    if (!elements.copyStatus) {
      return;
    }
    elements.copyStatus.textContent = message;
    elements.copyStatus.classList.toggle("is-error", Boolean(isError));
  }

  function selectOrderText() {
    var field = elements.orderCardText;
    if (!field) {
      return;
    }
    field.focus();
    field.select();
    if (typeof field.setSelectionRange === "function") {
      field.setSelectionRange(0, field.value.length);
    }
  }

  function showOrderDialog(orderData) {
    if (!elements.orderDialog || !elements.orderCardText) {
      return;
    }

    elements.orderCardText.value = order.buildOrderText(orderData);
    elements.copyOrderButton.textContent = "Копировать";
    setCopyStatus("", false);
    openDialog(elements.orderDialog, elements.copyOrderButton);
  }

  function handleCopyOrder() {
    var text = elements.orderCardText ? elements.orderCardText.value : "";
    if (!text) {
      return;
    }

    order.copyText(text).then(function (method) {
      if (method === "manual") {
        selectOrderText();
        setCopyStatus(
          "Не удалось скопировать автоматически. Выделите текст и нажмите Ctrl+C или Command+C.",
          true
        );
        return;
      }

      var message = "Заказ скопирован. Вставьте его в чат с кондитером.";
      setCopyStatus(message, false);
      elements.copyOrderButton.textContent = "Скопировано";

      window.clearTimeout(copyResetTimer);
      copyResetTimer = window.setTimeout(function () {
        elements.copyOrderButton.textContent = "Копировать";
      }, COPY_RESET_DELAY);
    });
  }

  function resetRadioGroup(container) {
    Array.prototype.forEach.call(
      container.querySelectorAll('input[type="radio"]'),
      function (input) {
        input.checked = false;
        input.removeAttribute("aria-invalid");
      }
    );
    syncSelectionClasses(container);
  }

  function resetForm() {
    state = emptyState();
    hasSubmitted = false;

    resetRadioGroup(elements.weightOptions);
    resetRadioGroup(elements.fillingOptions);
    resetRadioGroup(elements.decorOptions);

    elements.inscription.value = "";
    elements.pickupDate.value = "";
    elements.pickupTime.value = "";
    elements.customerName.value = "";
    elements.customerContact.value = "";
    elements.customerComment.value = "";

    refreshDateLimits();
    renderValidation({ valid: true, errors: [] }, false);
    updateCounters();
    updateSummary();
    clearDraft();
  }

  function handleResetOrder() {
    resetForm();
    closeDialog(elements.orderDialog);
    showToast("Форма очищена. Можно собрать новый заказ.");
  }

  function openLastOrder() {
    var saved = readLastOrder();

    if (!saved) {
      refreshLastOrderLink();
      showToast("Сохранённый заказ не найден.");
      return;
    }

    showOrderDialog(saved);
  }

  /* ------------------------------------------------------------------------
     Экран «Цены»
     ------------------------------------------------------------------------ */

  function createCell(text, label) {
    var cell = document.createElement("td");
    cell.textContent = text;
    if (label) {
      cell.setAttribute("data-label", label);
    }
    return cell;
  }

  function renderPrices() {
    var fillings = Array.isArray(config.fillings) ? config.fillings : [];
    var decor = Array.isArray(config.decor) ? config.decor : [];
    var inscription = config.inscription || {};
    var pickup = config.pickup || {};

    if (elements.pricesFillingsBody) {
      var fillingFragment = document.createDocumentFragment();
      fillings.forEach(function (filling) {
        var row = document.createElement("tr");
        row.appendChild(createCell(filling.name));
        row.appendChild(
          createCell(
            pricing.formatMoney(filling.pricePerKg) + "/кг",
            "Цена за кг"
          )
        );
        row.appendChild(createCell(filling.description || "—", "Описание"));
        fillingFragment.appendChild(row);
      });
      elements.pricesFillingsBody.replaceChildren(fillingFragment);
    }

    if (elements.pricesDecorBody) {
      var decorFragment = document.createDocumentFragment();
      decor.forEach(function (item) {
        var row = document.createElement("tr");
        row.appendChild(createCell(item.name));
        row.appendChild(
          createCell(pricing.formatMoney(item.price), "Цена")
        );
        row.appendChild(createCell(item.description || "—", "Описание"));
        decorFragment.appendChild(row);
      });
      elements.pricesDecorBody.replaceChildren(decorFragment);
    }

    if (elements.pricesConditions) {
      var conditions = [];
      var minWeight = Number(config.minWeightKg);
      var maxWeight = Number(config.maxWeightKg);
      var leadDays = Number(config.leadTimeDays);
      var maxLeadDays = Number(config.maxLeadTimeDays);

      if (Number.isFinite(minWeight) && Number.isFinite(maxWeight)) {
        conditions.push(
          "Вес: от " +
            pricing.formatWeight(minWeight) +
            " до " +
            pricing.formatWeight(maxWeight) +
            "."
        );
      }

      if (Number.isFinite(leadDays) && Number.isFinite(maxLeadDays)) {
        conditions.push(
          "Срок заказа: от " +
            leadDays +
            " до " +
            maxLeadDays +
            " календарных дней."
        );
      }

      if (pickup.from && pickup.to) {
        conditions.push(
          "Самовывоз: с " + pickup.from + " до " + pickup.to + "."
        );
      }
      if (pickup.address) {
        conditions.push("Адрес самовывоза: " + pickup.address + ".");
      }

      if (inscription.enabled !== false) {
        var inscriptionMax = Number(inscription.maxLength);
        var inscriptionText =
          "Надпись: " + pricing.formatMoney(inscription.price);
        if (Number.isFinite(inscriptionMax)) {
          inscriptionText += ", до " + inscriptionMax + " символов";
        }
        conditions.push(inscriptionText + ".");
      }

      var discountParts = getValidDiscountTiers().map(function (tier) {
        return tier.percent + "% — за " + pricing.formatDays(tier.minDays);
      });

      if (discountParts.length) {
        conditions.push(
          "Скидка за ранний заказ: " + discountParts.join(", ") + "."
        );
      }

      var conditionFragment = document.createDocumentFragment();
      conditions.forEach(function (text) {
        var item = document.createElement("li");
        item.textContent = text;
        conditionFragment.appendChild(item);
      });
      elements.pricesConditions.replaceChildren(conditionFragment);
    }

    if (elements.pricesDisclaimer) {
      elements.pricesDisclaimer.textContent = config.disclaimer || "";
    }
  }

  /* ------------------------------------------------------------------------
     Обработчики
     ------------------------------------------------------------------------ */

  function handleStateChange() {
    saveDraft();
    updateSummary();
    updateCatalogSelection(elements.catalogGrid, "data-filling-id", state.fillingId);
    updateCatalogSelection(elements.decorGrid, "data-decor-id", state.decorId);

    if (hasSubmitted) {
      renderValidation(
        order.validateSelection(getSelection(), config),
        false
      );
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    hasSubmitted = true;
    saveDraft();

    var selection = getSelection();
    var validation = order.validateSelection(selection, config);
    renderValidation(validation, true);

    if (!validation.valid) {
      return;
    }

    var price = pricing.calculatePrice(selection, config);
    var snapshot = order.buildOrder(selection, price, config);
    saveLastOrder(snapshot);
    showOrderDialog(snapshot);
  }

  function proceedWithClearData() {
    storageRemove(STORAGE_KEYS.draft);
    storageRemove(STORAGE_KEYS.lastOrder);
    resetForm();
    refreshLastOrderLink();
    closeDialog(elements.clearDialog);
    showToast("Сохранённые данные удалены.");
  }

  function bindRadioGroup(container, field) {
    container.addEventListener("change", function (event) {
      var input =
        event.target && event.target.closest
          ? event.target.closest('input[type="radio"]')
          : null;

      if (!input || input.name !== field) {
        return;
      }

      state[field] =
        field === "weightKg" ? Number(input.value) : input.value;
      syncSelectionClasses(container);
      handleStateChange();
    });
  }

  function bindEvents() {
    elements.form.addEventListener("submit", handleSubmit);
    bindRadioGroup(elements.weightOptions, "weightKg");
    bindRadioGroup(elements.fillingOptions, "fillingId");
    bindRadioGroup(elements.decorOptions, "decorId");

    elements.inscription.addEventListener("input", function () {
      state.inscription = elements.inscription.value;
      updateCounters();
      handleStateChange();
    });

    elements.pickupDate.addEventListener("change", function () {
      state.pickupDate = elements.pickupDate.value;
      handleStateChange();
    });
    elements.pickupDate.addEventListener("focus", refreshDateLimits);

    elements.pickupTime.addEventListener("change", function () {
      state.pickupTime = elements.pickupTime.value;
      handleStateChange();
    });

    elements.customerName.addEventListener("input", function () {
      state.customerName = elements.customerName.value;
      handleStateChange();
    });

    elements.customerContact.addEventListener("input", function () {
      state.customerContact = elements.customerContact.value;
      handleStateChange();
    });

    elements.customerComment.addEventListener("input", function () {
      state.customerComment = elements.customerComment.value;
      updateCounters();
      handleStateChange();
    });

    elements.copyOrderButton.addEventListener("click", handleCopyOrder);
    elements.resetOrderButton.addEventListener("click", handleResetOrder);

    elements.openPricesButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        openDialog(elements.pricesDialog);
      });
    });

    elements.openCatalogButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        updateCatalogSelection(
          elements.catalogGrid,
          "data-filling-id",
          state.fillingId
        );
        openDialog(elements.catalogDialog);
      });
    });

    elements.openDecorCatalogButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        updateCatalogSelection(
          elements.decorGrid,
          "data-decor-id",
          state.decorId
        );
        openDialog(elements.decorDialog);
      });
    });

    elements.openLastOrderButton.addEventListener("click", openLastOrder);

    elements.clearDataButton.addEventListener("click", function () {
      openDialog(elements.clearDialog, elements.clearCancelButton);
    });
    elements.confirmClearButton.addEventListener(
      "click",
      proceedWithClearData
    );

    elements.dialogs.forEach(bindDialog);
  }

  function init() {
    elements = collectElements();
    if (!elements.form || !elements.weightOptions) {
      return;
    }

    applyConfig();
    restoreDraft();
    renderWeightOptions();
    renderFillingOptions();
    renderDecorOptions();
    renderPickupTimes();
    applyRestoredValues();
    renderPrices();
    renderFillingCatalog();
    renderDecorCatalog();
    bindEvents();
    updateCounters();
    updateSummary();
    refreshLastOrderLink();

    if (pendingDraftNotice) {
      showToast(pendingDraftNotice);
      pendingDraftNotice = "";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
