/**
 * Настройки калькулятора торта.
 *
 * Это единственный файл, в котором кондитер меняет цены,
 * варианты веса, срок заказа и часы самовывоза.
 * После изменения файла достаточно обновить страницу.
 */
window.CAKE_CONFIG = {
  currency: "RUB",

  // Вес торта: от 1 до 5 кг с шагом 0,5 кг.
  minWeightKg: 1,
  maxWeightKg: 5,
  weightOptionsKg: [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5],

  // Начинки: цена указана за килограмм готового торта.
  // visual.style задаёт сюжет иллюстрации: cream, chocolate, berry,
  // caramel, nut.
  fillings: [
    {
      id: "vanilla",
      name: "Ваниль",
      pricePerKg: 2500,
      description: "Классический ванильный бисквит с нежным сливочным кремом",
      visual: {
        style: "cream",
        from: "#fbf0dd",
        to: "#e8cfa6",
        accent: "#d9a86a",
      },
    },
    {
      id: "chocolate",
      name: "Шоколад",
      pricePerKg: 2700,
      description: "Шоколадный бисквит с ганашем и сливочным кремом",
      visual: {
        style: "chocolate",
        from: "#e8d4c3",
        to: "#a9714a",
        accent: "#6b3f27",
      },
    },
    {
      id: "berry",
      name: "Ягода",
      pricePerKg: 2800,
      description: "Бисквит с ягодным конфи и сливочным кремом",
      visual: {
        style: "berry",
        from: "#f7d7e0",
        to: "#c76d8c",
        accent: "#a33f5f",
      },
    },
    {
      id: "caramel",
      name: "Карамель",
      pricePerKg: 2750,
      description: "Бисквит с солёной карамелью и кремом",
      visual: {
        style: "caramel",
        from: "#f8e2bd",
        to: "#d39a4e",
        accent: "#a86a22",
      },
    },
    {
      id: "pistachio",
      name: "Фисташка",
      pricePerKg: 3000,
      description: "Фисташковый бисквит с кремом из фисташковой пасты",
      visual: {
        style: "nut",
        from: "#e3efd4",
        to: "#9fc07a",
        accent: "#5f8a3f",
      },
    },
  ],

  // Декор: фиксированная стоимость за торт.
  // visual.style задаёт иллюстрацию: none, minimal, themed, figures.
  decor: [
    {
      id: "none",
      name: "Без декора",
      price: 0,
      description: "Аккуратная кремовая поверхность",
      visual: {
        style: "none",
        from: "#fbf1e6",
        to: "#e3cbb0",
        accent: "#c9a887",
      },
    },
    {
      id: "minimal",
      name: "Минимализм",
      price: 700,
      description: "Сдержанный декор в спокойной палитре",
      visual: {
        style: "minimal",
        from: "#fbf1e6",
        to: "#e3cbb0",
        accent: "#b08968",
      },
    },
    {
      id: "themed",
      name: "Тематический",
      price: 1500,
      description: "Декор под повод: день рождения, детский праздник, годовщина",
      visual: {
        style: "themed",
        from: "#fdeee0",
        to: "#f3c9a8",
        accent: "#c45a3c",
      },
    },
    {
      id: "figures",
      name: "Фигурки",
      price: 2500,
      description: "Объёмные фигурки и индивидуальные элементы",
      visual: {
        style: "figures",
        from: "#f7ecdf",
        to: "#e0c4a2",
        accent: "#8c5a3c",
      },
    },
  ],

  // Необязательная надпись на торте.
  inscription: {
    enabled: true,
    price: 300,
    maxLength: 30,
  },

  // Скидка за ранний заказ: процент зависит от числа дней до выдачи.
  // Если подходит несколько порогов, применяется наибольший процент.
  earlyBookingDiscount: {
    enabled: true,
    tiers: [
      { minDays: 7, percent: 5 },
      { minDays: 14, percent: 10 },
    ],
  },

  // Минимальная дата выдачи — через 2 календарных дня.
  leadTimeDays: 2,
  maxLeadTimeDays: 60,

  // Самовывоз.
  pickup: {
    enabled: true,
    address: "",
    from: "10:00",
    to: "19:00",
    stepMinutes: 30,
  },

  disclaimer:
    "Цена предварительная. Кондитер подтвердит заказ и итоговую стоимость.",
};
