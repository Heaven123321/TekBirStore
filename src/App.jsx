
import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";
import WebApp from "@twa-dev/sdk";

// ======================================================
//                      CONFIG
// ======================================================

// один лист, все товары (и новые, и Б/У)
const GOOGLE_SHEETS_URL =
  "https://sheets.googleapis.com/v4/spreadsheets/10NJBIbIQoBdRj1hbMIAHjpbBI31GYl2jzg_ztozN4V8/values/%D0%9B%D0%B8%D1%81%D1%821!A2:O?key=AIzaSyAf1c8boQXOw54SGVB5X_E2o2IPrfQiLiQ";

const STORE_INFO = {
  title: "Москва, Мельникова 2",
  time: "11:00 — 20:00",
  phone: "+7 (967) 013-13-00",
};

const COLORS = {
  bg: "#AFC6DD", // голубой фон
  card: "#E5D5CD", // карточки
  accent: "#E38B58", // персиковые кнопки/акценты
  accentSoft: "#F5B98A",
  textMain: "#111111",
  textSub: "#555555",
  tabInactive: "#9CA3AF",
};

const CATEGORY_MAP = {
  apple: "iPhone",
  iphone: "iPhone",
  айфон: "iPhone",
  xiaomi: "Xiaomi",
  mi: "Xiaomi",
  samsung: "Samsung",
  airpods: "AirPods",
  "air pods": "AirPods",
  watch: "Watch",
  "apple watch": "Watch",
  ipad: "iPad",
  mac: "MacBook",
  macbook: "MacBook",
};

const CATEGORIES = [
  { id: "iPhone", label: "iPhone" },
  { id: "Xiaomi", label: "Xiaomi" },
  { id: "Samsung", label: "Samsung" },
  { id: "PlayStation", label: "PlayStation" },
  { id: "MacBook", label: "MacBook" },
  { id: "iPad", label: "iPad" },
  { id: "Watch", label: "Apple Watch" },
  { id: "AirPods", label: "AirPods" },
  { id: "Accessories", label: "Аксессуары" },
];

// ======================================================
//                       UTILS
// ======================================================

function normalizeCategory(value = "") {
  const key = value.toLowerCase().trim();
  if (CATEGORY_MAP[key]) return CATEGORY_MAP[key];
  for (const term of Object.keys(CATEGORY_MAP)) {
    if (key.includes(term)) return CATEGORY_MAP[term];
  }
  return "Other";
}

const formatPrice = (value) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0, // без копеек
  }).format(value || 0);

const conditionLabel = (cond) =>
  cond === "used" ? "Б/У" : "Новый";

function parsePhotos(cell = "") {
  if (!cell) return [];
  return cell
    .split(/[\s,]+/g)
    .map((s) => s.trim())
    .filter((s) => s.startsWith("http"));
}

// телефон → "89951128230"
function normalizePhone(input) {
  const raw = input.trim();

  // только цифры и + (никаких пробелов/других символов)
  if (!/^[\d+]+$/.test(raw)) return null;

  const digits = raw.replace(/\D/g, ""); // убираем +

  if (digits.length !== 11) return null;

  const first = digits[0];
  if (first !== "7" && first !== "8") return null;

  // всё приводим к 8ХХХ…
  return "8" + digits.slice(1);
}

// ======================================================
//               LOAD PRODUCTS FROM SHEET
// ======================================================

async function loadProducts() {
  const res = await fetch(GOOGLE_SHEETS_URL);
  const json = await res.json();

  if (!json.values) return [];

  return json.values.map((row, idx) => {
    const id = row[0] || `row-${idx}`;
    const name = row[1] || "Без названия";
    const price = Number(row[2]) || 0;
    const categoryRaw = row[3] || "";
    const brand = row[4] || "";
    const conditionRaw = (row[5] || "").toLowerCase();
    const capacity = row[6] || "";
    const photoCell = row[7] || "";
    const description = row[8] || "";
    const color = row[9] || "";
    const status = row[11] || "Свободен";

    let condition = "new";
    if (
      conditionRaw.includes("used") ||
      conditionRaw.includes("б/у") ||
      conditionRaw.includes("бу")
    ) {
      condition = "used";
    }

    const photos = parsePhotos(photoCell);
    const photo = photos[0] || null;

    return {
      id,
      name,
      price,
      category: normalizeCategory(categoryRaw),
      brand,
      condition,
      capacity,
      photo,
      photos,
      description,
      color,
      status, // ← ДОБАВИЛИ
    };
  });
}

// ======================================================
//                         APP
// ======================================================

export default function App() {
  const [activeTab, setActiveTab] = useState("home"); // home | catalog | cart | support | profile
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState(null);

  const [selectedProduct, setSelectedProduct] = useState(null);

  const [conditionFilter, setConditionFilter] = useState("new"); // new | used
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [search, setSearch] = useState("");

  const [cart, setCart] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);

  const [photoViewerIndex, setPhotoViewerIndex] = useState(0);

  // user
  const [tgUsername, setTgUsername] = useState(null);
  const [userPhoto, setUserPhoto] = useState(null);
  const [userName, setUserName] = useState("Пользователь");

  // checkout
  const [checkoutStep, setCheckoutStep] = useState("cart");
  const [checkoutForm, setCheckoutForm] = useState({
    name: "",
    phone: "",
    contactMethod: "whatsapp", // whatsapp | telegram | call
    deliveryMethod: "courier", // courier | store
    deliveryType: "moscow", // moscow | other (для курьера)
    address: "",
    comment: "",
  });
  const [phoneError, setPhoneError] = useState("");

  // profile submenu
  const [profileSection, setProfileSection] = useState("main"); // main | info | fav | stores

  // INIT TELEGRAM
  useEffect(() => {
    try {
      WebApp.ready();
      WebApp.expand();

      const tgUser = WebApp.initDataUnsafe?.user;
      if (tgUser) {
        if (tgUser.first_name || tgUser.last_name) {
          setUserName(
            [tgUser.first_name, tgUser.last_name]
              .filter(Boolean)
              .join(" ")
          );
        }
        if (tgUser.photo_url) setUserPhoto(tgUser.photo_url);
        if (tgUser.username) setTgUsername(tgUser.username);
      }
    } catch (e) {
      console.log("TG init error", e);
    }
  }, []);
  useEffect(() => {
    let startY = 0;
    let isPulling = false;

    const handleTouchStart = (e) => {
      if (window.scrollY === 0) {
        startY = e.touches[0].clientY;
        isPulling = true;
      }
    };

    const handleTouchMove = (e) => {
      if (!isPulling) return;

      const currentY = e.touches[0].clientY;
      const diff = currentY - startY;

      if (diff > 80) {
        // 🔥 Потянули вниз достаточно → обновляем товары
        isPulling = false;

        loadProducts().then((data) => {
          setProducts(data);
        });
      }
    };

    const handleTouchEnd = () => {
      isPulling = false;
    };

    document.addEventListener("touchstart", handleTouchStart);
    document.addEventListener("touchmove", handleTouchMove);
    document.addEventListener("touchend", handleTouchEnd);

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  // LOAD PRODUCTS
  useEffect(() => {
    let canceled = false;
    setLoadingProducts(true);

    loadProducts()
      .then((data) => {
        if (!canceled) {
          setProducts(data);
          setProductsError(null);
        }
      })
      .catch((err) => {
        console.error(err);
        if (!canceled) setProductsError("Не удалось загрузить прайс");
      })
      .finally(() => {
        if (!canceled) setLoadingProducts(false);
      });

    return () => {
      canceled = true;
    };
  }, []);

  // CART ACTIONS
  const addToCart = useCallback((product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);

      if (existing) {
        return prev.map((i) =>
          i.id === product.id ? { ...i, qty: i.qty + 1 } : i
        );
      }

      return [
        ...prev,
        {
          id: product.id,
          name: product.name,
          price: product.price,
          capacity: product.capacity || "",
          qty: 1,
        },
      ];
    });
  }, []);

  const changeQty = useCallback((id, delta) => {
    setCart((prev) =>
      prev
        .map((i) =>
          i.id === id ? { ...i, qty: i.qty + delta } : i
        )
        .filter((i) => i.qty > 0)
    );
  }, []);

  const removeFromCart = useCallback((id) => {
    setCart((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const toggleFavorite = useCallback((id) => {
    setFavorites((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id]
    );
  }, []);

  const cartDetailed = useMemo(() => {
    return cart.map((item) => {
      const product = products.find((p) => p.id === item.id);
      return {
        ...item,
        product,
        lineTotal: (product?.price || 0) * item.qty,
      };
    });
  }, [cart, products]);

  const cartTotal = cartDetailed.reduce(
    (s, i) => s + i.lineTotal,
    0
  );

  const deliveryPrice =
    checkoutForm.deliveryMethod === "store"
      ? 0
      : checkoutForm.deliveryType === "moscow"
      ? 1000
      : 500;

  const totalWithDelivery = cartTotal + deliveryPrice;

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (p.status === "Продан") return false; // ❌ не показываем
      if (p.condition !== conditionFilter) return false;
      if (
        selectedCategory &&
        selectedCategory !== p.category
      )
        return false;
      if (
        search &&
        !p.name.toLowerCase().includes(search.toLowerCase())
      )
        return false;
      return true;
    });
  }, [products, conditionFilter, selectedCategory, search]);

  const handleSupportClick = () => {
    const url = "https://t.me/remontqq";
    try {
      WebApp.openTelegramLink(url);
    } catch {
      window.open(url, "_blank");
    }
  };

  const handlePhoneChange = (value) => {
    setCheckoutForm((f) => ({ ...f, phone: value }));
    const normalized = normalizePhone(value);
    if (!normalized && value.trim() !== "") {
      setPhoneError(
        "Введите номер вида 89951128230 (11 цифр, начинается с 7/8/+7)"
      );
    } else {
      setPhoneError("");
    }
  };

  const isPhoneValid = !!normalizePhone(checkoutForm.phone);

  // SUBMIT ORDER
  function submitOrder() {
    const normalizedPhone = normalizePhone(
      checkoutForm.phone
    );
    if (!normalizedPhone) {
      setPhoneError(
        "Введите номер вида 89951128230 (11 цифр, начинается с 7/8/+7)"
      );
      return;
    }

    const order = {
      ...checkoutForm,
      phone: normalizedPhone,
      items: cartDetailed,
      total: totalWithDelivery,
      tg_username: tgUsername || null,
    };

    const API_URL =
      import.meta.env.VITE_API_URL || "http://localhost:8080";

    fetch(`${API_URL}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(order),
    })
      .then(async (res) => {
        const txt = await res.text();
        console.log("Ответ сервера:", txt);

        if (!res.ok) {
          throw new Error("Сервер вернул ошибку");
        }
        alert("Заказ оформлен! Мы свяжемся с вами");

        setCart([]);
        setCheckoutStep("cart");
        setActiveTab("home");

        // 🔥 ОБНОВЛЕНИЕ СПИСКА ТОВАРОВ
        loadProducts().then((data) => {
          setProducts(data);
          setSelectedProduct(null);
        });
      })
      .catch((err) => {
        console.error("Ошибка отправки заказа:", err);
        alert("Ошибка отправки заказа");
      });
  }

  // ======================================================
  //                      SCREENS
  // ======================================================

  const renderHome = () => (
    <div className="flex-1 overflow-y-auto pb-24 px-4 pt-4">
      <h1 className="text-2xl font-semibold mb-4">
        TekBir
      </h1>

      {/* Search */}
      <SearchInput value={search} onChange={setSearch} />

      {/* Баннер */}
      <div
        className="mt-4 rounded-3xl p-4"
        style={{ backgroundColor: COLORS.card }}
      >
        <p className="text-xl font-semibold text-black">
          Новая техника?
        </p>
        <p
          className="text-sm mt-1"
          style={{ color: COLORS.textSub }}
        >
          Год спокойствия в подарок!
        </p>

        <div className="flex gap-2 mt-4">
          <button
            onClick={() => {
              setActiveTab("catalog");
              setConditionFilter("new");
            }}
            className="flex-1 py-2 rounded-2xl text-sm font-semibold"
            style={{
              backgroundColor: COLORS.accent,
              color: "white",
            }}
          >
            Новое
          </button>
          <button
            onClick={() => {
              setActiveTab("catalog");
              setConditionFilter("used");
            }}
            className="flex-1 py-2 rounded-2xl text-sm font-semibold"
            style={{
              backgroundColor: COLORS.card,
              color: COLORS.textMain,
            }}
          >
            Б/У
          </button>
        </div>
      </div>

      {/* Хиты продаж */}
      <section className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">
            Хиты продаж
          </h2>
          <button
            onClick={() => setActiveTab("catalog")}
            className="text-xs"
            style={{ color: COLORS.textSub }}
          >
            Смотреть все →
          </button>
        </div>

        {loadingProducts ? (
          <p style={{ color: COLORS.textSub }}>
            Загрузка...
          </p>
        ) : productsError ? (
          <p className="text-red-500">{productsError}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {products.filter(p => p.status !== "Продан").slice(0, 4).map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
                onAddToCart={addToCart}
                onOpen={setSelectedProduct}
              />
            ))}
          </div>
        )}
      </section>

      {/* Поддержка */}
      <section className="mt-6">
        <h2 className="text-lg font-semibold mb-2">
          Поддержка
        </h2>

        <button
          onClick={handleSupportClick}
          className="w-full rounded-3xl flex items-center gap-3 px-4 py-3"
          style={{ backgroundColor: COLORS.card }}
        >
          <div className="w-10 h-10 rounded-full bg-gray-400 flex items-center justify-center">
            👤
          </div>

          <div className="flex-1 text-left">
            <p className="text-sm font-medium">
              Написать в поддержку
            </p>
            <p
              className="text-xs"
              style={{ color: COLORS.textSub }}
            >
              @remontqq
            </p>
          </div>

          <span>›</span>
        </button>
      </section>
    </div>
  );

  const renderCatalog = () => (
    <div className="flex-1 overflow-y-auto pb-24 px-4 pt-4">
      <SearchInput value={search} onChange={setSearch} />

      {/* condition */}
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => setConditionFilter("new")}
          className="flex-1 py-2 rounded-2xl text-sm font-semibold"
          style={{
            backgroundColor:
              conditionFilter === "new"
                ? COLORS.accent
                : COLORS.card,
            color:
              conditionFilter === "new"
                ? "white"
                : COLORS.textMain,
          }}
        >
          Новые
        </button>
        <button
          onClick={() => setConditionFilter("used")}
          className="flex-1 py-2 rounded-2xl text-sm font-semibold"
          style={{
            backgroundColor:
              conditionFilter === "used"
                ? COLORS.accent
                : COLORS.card,
            color:
              conditionFilter === "used"
                ? "white"
                : COLORS.textMain,
          }}
        >
          Б/У
        </button>
      </div>

      {/* categories */}
      <div className="mt-4">
        <p
          className="text-xs mb-2"
          style={{ color: COLORS.textSub }}
        >
          Категории
        </p>
        <div className="grid grid-cols-3 gap-3">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() =>
                setSelectedCategory((prev) =>
                  prev === c.id ? null : c.id
                )
              }
              className="rounded-2xl px-2 py-4 text-xs text-center"
              style={{
                backgroundColor: COLORS.card,
                border:
                  selectedCategory === c.id
                    ? `2px solid ${COLORS.accent}`
                    : "2px solid transparent",
              }}
            >
              <div className="w-full h-10 bg-gray-300 rounded-xl mb-1 flex justify-center items-center">
                📱
              </div>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* product list */}
      <div className="mt-4">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold">Товары</h2>
          {selectedCategory && (
            <button
              onClick={() => setSelectedCategory(null)}
              className="text-xs"
              style={{ color: COLORS.textSub }}
            >
              Сбросить фильтр
            </button>
          )}
        </div>

        {loadingProducts ? (
          <p style={{ color: COLORS.textSub }}>
            Загрузка...
          </p>
        ) : filteredProducts.length === 0 ? (
          <p style={{ color: COLORS.textSub }}>
            Нет товаров по выбранным фильтрам
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredProducts.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
                onAddToCart={addToCart}
                onOpen={setSelectedProduct}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderCart = () => {
    if (checkoutStep === "checkout") return renderCheckout();

    return (
      <div className="flex-1 overflow-y-auto pb-24 px-4 pt-4">
        <h1 className="text-xl font-semibold mb-3">Корзина</h1>

        {cartDetailed.length === 0 ? (
          <div className="text-center mt-10">
            <p className="mb-2">Корзина пуста</p>
            <p style={{ color: COLORS.textSub }}>
              Добавьте товары из каталога
            </p>

            <button
              onClick={() => setActiveTab("catalog")}
              className="mt-4 px-6 py-2 rounded-2xl font-semibold"
              style={{
                backgroundColor: COLORS.accent,
                color: "white",
              }}
            >
              В каталог
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {cartDetailed.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl p-3 flex gap-3"
                  style={{ backgroundColor: COLORS.card }}
                >
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-200 flex justify-center items-center">
                    {item.product?.photo ? (
                      <img
                        src={item.product.photo}
                        alt={item.product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      "📱"
                    )}
                  </div>

                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {item.product?.name}
                      {item.product?.capacity
                        ? ` ${item.product.capacity}`
                        : ""}
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: COLORS.textSub }}
                    >
                      {conditionLabel(
                        item.product?.condition
                      )}
                    </p>
                    <p className="mt-1 font-semibold">
                      {formatPrice(item.product?.price)}
                    </p>
                  </div>

                  <div className="flex flex-col items-end justify-between">
                    <button
                      onClick={() => removeFromCart(item.id)}
                      style={{ color: COLORS.textSub }}
                    >
                      🗑
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          changeQty(item.id, -1)
                        }
                        className="w-7 h-7 rounded-full border flex items-center justify-center"
                      >
                        -
                      </button>
                      <span>{item.qty}</span>
                      <button
                        onClick={() =>
                          changeQty(item.id, 1)
                        }
                        className="w-7 h-7 rounded-full border flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* summary */}
            <div className="mt-4 space-y-1">
              <Row
                label="Сумма"
                value={formatPrice(cartTotal)}
                subtle
              />
              <Row
                label="Доставка"
                value={formatPrice(deliveryPrice)}
                subtle
              />
              <Row
                label="Итого"
                value={formatPrice(totalWithDelivery)}
                bold
              />

              <p
                className="text-xs"
                style={{ color: COLORS.textSub }}
              >
                {cart.length} позиций в корзине
              </p>
            </div>

            <button
              onClick={() => setCheckoutStep("checkout")}
              className="w-full mt-4 py-3 rounded-2xl font-semibold"
              style={{
                backgroundColor: COLORS.accent,
                color: "white",
              }}
            >
              Оформить заказ
            </button>
          </>
        )}
      </div>
    );
  };

  const renderProductDetails = () => {
    if (!selectedProduct) return null;

    const p = selectedProduct;

    return (
      <div className="flex-1 overflow-y-auto pb-24 px-4 pt-4">
        <button
          className="mb-3 text-lg flex items-center"
          onClick={() => setSelectedProduct(null)}
        >
          ← Назад
        </button>

        {/* Галерея фото */}
        <div className="w-full pb-3">
          {p.photos && p.photos.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto">
              {p.photos.map((url, idx) => (
                <div
                  key={idx}
                  role="button"
                  className="flex-shrink-0 w-64 h-64 rounded-3xl overflow-hidden bg-gray-200"
                  onClick={() => {
                    setPhotoViewerIndex(idx);
                    setPhotoViewerOpen(true);
                  }}
                  style={{ cursor: "zoom-in" }}
                >
                  <img
                    src={url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="w-full h-64 rounded-3xl overflow-hidden bg-gray-200 flex justify-center items-center">
              <span className="text-5xl">📱</span>
            </div>
          )}
        </div>


        <h1 className="text-2xl font-semibold mt-4">
          {p.name}
        </h1>

        <div
          className="mt-2 space-y-1 text-sm"
          style={{ color: COLORS.textMain }}
        >
          {p.color && (
            <p>
              <span className="font-semibold">
                Цвет:
              </span>{" "}
              {p.color}
            </p>
          )}

          {p.capacity && (
            <p>
              <span className="font-semibold">
                Память:
              </span>{" "}
              {p.capacity}
            </p>
          )}

          <p>
            <span className="font-semibold">
              Состояние:
            </span>{" "}
            {conditionLabel(p.condition)}
          </p>
        </div>

        <p className="text-2xl font-bold mt-3">
          {formatPrice(p.price)}
        </p>

        <div className="mt-4 text-sm">
          <p className="font-semibold mb-1">Описание</p>
          <p
            style={{
              color: COLORS.textMain,
              whiteSpace: "pre-line",
            }}
          >
            {p.description && p.description.trim() !== ""
              ? p.description
              : "Описание отсутствует"}
          </p>
        </div>

        <div className="flex items-center gap-3 mt-4">

          {/* В КОРЗИНУ */}
          {p.status === "Свободен" ? (
            <button
              className="flex-1 py-3 rounded-2xl font-semibold text-black"
              style={{ backgroundColor: COLORS.accent }}
              onClick={() => addToCart(p)}
            >
              В корзину
            </button>
          ) : (
            <button
              disabled
              className="flex-1 py-3 rounded-2xl font-semibold opacity-50"
              style={{ backgroundColor: COLORS.card, color: COLORS.textSub }}
            >
              {p.status === "Резерв" ? "В резерве" : "Продан"}
            </button>
          )}

          {/* СЕРДЕЧКО — ИЗБРАННОЕ */}
          <button
            onClick={() => toggleFavorite(p.id)}
            className="w-12 h-12 flex items-center justify-center rounded-2xl"
            style={{
              backgroundColor: COLORS.card,
              fontSize: 26,
              color: favorites.includes(p.id)
                ? COLORS.accent
                : COLORS.textSub,
            }}
          >
            {favorites.includes(p.id) ? "♥" : "♡"}
          </button>
        </div>
      </div>
    );
  };

  const renderCheckout = () => (
    <div className="flex-1 overflow-y-auto pb-24 px-4 pt-4 space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => setCheckoutStep("cart")}>
          ‹
        </button>
        <h1 className="text-xl font-semibold">
          Оформление заказа
        </h1>
      </div>

      <Field
        label="Ваше имя"
        value={checkoutForm.name}
        onChange={(v) =>
          setCheckoutForm((f) => ({ ...f, name: v }))
        }
        placeholder="Ваше имя"
      />

      <Field
        label="Телефон"
        value={checkoutForm.phone}
        onChange={handlePhoneChange}
        placeholder="89951128230"
      />
      {phoneError && (
        <p className="text-xs text-red-500">{phoneError}</p>
      )}

      {/* contact */}
      <div>
        <p className="font-medium mb-1">Как связаться</p>
        <div className="flex gap-2">
          <ChoiceButton
            label="WhatsApp"
            active={checkoutForm.contactMethod === "whatsapp"}
            onClick={() =>
              setCheckoutForm((f) => ({
                ...f,
                contactMethod: "whatsapp",
              }))
            }
          />
          <ChoiceButton
            label="Telegram"
            active={checkoutForm.contactMethod === "telegram"}
            onClick={() =>
              setCheckoutForm((f) => ({
                ...f,
                contactMethod: "telegram",
              }))
            }
          />
          <ChoiceButton
            label="Звонок"
            active={checkoutForm.contactMethod === "call"}
            onClick={() =>
              setCheckoutForm((f) => ({
                ...f,
                contactMethod: "call",
              }))
            }
          />
        </div>
      </div>

      {/* delivery method */}
      <div>
        <p className="font-medium mb-1">
          Способ получения
        </p>
        <div className="flex gap-2">
          <ChoiceButton
            label="Курьер"
            active={checkoutForm.deliveryMethod === "courier"}
            onClick={() =>
              setCheckoutForm((f) => ({
                ...f,
                deliveryMethod: "courier",
              }))
            }
          />
          <ChoiceButton
            label="В магазине"
            active={checkoutForm.deliveryMethod === "store"}
            onClick={() =>
              setCheckoutForm((f) => ({
                ...f,
                deliveryMethod: "store",
                address: STORE_INFO.title, // автоподстановка, но можно изменить
              }))
            }
          />
        </div>
      </div>

      {/* delivery type */}
      {checkoutForm.deliveryMethod === "courier" && (
        <div>
          <p className="font-medium mb-1">Тип доставки</p>
          <button
            onClick={() =>
              setCheckoutForm((f) => ({
                ...f,
                deliveryType: "moscow",
              }))
            }
            className="w-full px-3 py-2 rounded-2xl mt-1"
            style={{
              backgroundColor:
                checkoutForm.deliveryType === "moscow"
                  ? COLORS.accent
                  : COLORS.card,
              color:
                checkoutForm.deliveryType === "moscow"
                  ? "white"
                  : COLORS.textMain,
            }}
          >
            Москва — 1000₽
          </button>
          <button
            onClick={() =>
              setCheckoutForm((f) => ({
                ...f,
                deliveryType: "other",
              }))
            }
            className="w-full px-3 py-2 rounded-2xl mt-2"
            style={{
              backgroundColor:
                checkoutForm.deliveryType === "other"
                  ? COLORS.accent
                  : COLORS.card,
              color:
                checkoutForm.deliveryType === "other"
                  ? "white"
                  : COLORS.textMain,
            }}
          >
            Другие города (СДЭК) — 500₽
          </button>
        </div>
      )}

      <Field
        label="Адрес"
        value={checkoutForm.address}
        onChange={(v) =>
          setCheckoutForm((f) => ({ ...f, address: v }))
        }
        placeholder="Адрес доставки или магазин"
      />

      <Field
        label="Комментарий"
        value={checkoutForm.comment}
        onChange={(v) =>
          setCheckoutForm((f) => ({ ...f, comment: v }))
        }
        placeholder="Звоните заранее"
      />

      <div className="space-y-1">
        <Row
          label="Товары"
          value={formatPrice(cartTotal)}
          subtle
        />
        <Row
          label="Доставка"
          value={formatPrice(deliveryPrice)}
          subtle
        />
        <Row
          label="Итого"
          value={formatPrice(totalWithDelivery)}
          bold
        />

        <p
          className="text-xs"
          style={{ color: COLORS.textSub }}
        >
          Нажимая кнопку, вы соглашаетесь с обработкой данных
        </p>
      </div>

      <button
        onClick={submitOrder}
        disabled={!isPhoneValid || cartDetailed.length === 0}
        className="w-full py-3 rounded-2xl font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
        style={{
          backgroundColor: COLORS.accent,
          color: "white",
        }}
      >
        Подтвердить заказ
      </button>
    </div>
  );

  const renderSupport = () => (
    <div className="flex-1 overflow-y-auto pb-24 px-4 pt-4">
      <h1 className="text-xl font-semibold">Поддержка</h1>
      <p
        className="mt-2 text-sm"
        style={{ color: COLORS.textSub }}
      >
        Если возникли вопросы — мы рядом!
      </p>

      <button
        onClick={handleSupportClick}
        className="w-full mt-4 rounded-2xl py-3 text-center font-semibold"
        style={{
          backgroundColor: COLORS.accent,
          color: "white",
        }}
      >
        Написать в поддержку
      </button>
    </div>
  );

  const renderProfileMain = () => (
    <div className="flex-1 overflow-y-auto pb-24 px-4 pt-4">
      <h1 className="text-xl font-semibold text-center">
        Профиль
      </h1>

      <div className="flex flex-col items-center mt-4">
        {userPhoto ? (
          <img
            src={userPhoto}
            alt="avatar"
            className="w-24 h-24 rounded-full object-cover"
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-gray-400 flex justify-center items-center text-3xl">
            👤
          </div>
        )}
        <p className="mt-2 font-medium">{userName}</p>
        {tgUsername && (
          <p
            className="text-xs"
            style={{ color: COLORS.textSub }}
          >
            @{tgUsername}
          </p>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <ProfileRow
          title="Личная информация"
          subtitle="Имя, телефон"
          onClick={() => setProfileSection("info")}
        />
        <ProfileRow
          title="Избранное"
          subtitle={`${favorites.length} товаров`}
          onClick={() => setProfileSection("fav")}
        />
        <ProfileRow
          title="Магазины"
          subtitle={STORE_INFO.title}
          onClick={() => setProfileSection("stores")}
        />
      </div>

      <div
        className="mt-4 p-3 rounded-3xl"
        style={{ backgroundColor: COLORS.card }}
      >
        <div className="w-full h-32 bg-[#fbe7dc] rounded-2xl flex justify-center items-center text-4xl">
          🏬
        </div>

        <p className="mt-2 font-medium">{STORE_INFO.title}</p>
        <p style={{ color: COLORS.textSub }}>
          {STORE_INFO.time}
        </p>
        <p style={{ color: COLORS.textSub }}>
          {STORE_INFO.phone}
        </p>
      </div>
    </div>
  );

  const renderProfileInfo = () => (

    <div className="flex-1 overflow-y-auto px-4 pt-4 pb-24">

      <button
        className="mb-3 text-lg flex items-center"
        onClick={() => setProfileSection("main")}
      >
        ← Назад
      </button>

      <h1 className="text-xl font-semibold mb-4">
        Личная информация
      </h1>

      {/* Аватар */}
      <div className="flex flex-col items-center mt-2">
        {userPhoto ? (
          <img
            src={userPhoto}
            className="w-24 h-24 rounded-full object-cover"
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-gray-400 flex justify-center items-center text-3xl">
            👤
          </div>
        )}
      </div>

      {/* Поле имени */}
      <div className="mt-5">
        <Field
          label="Имя"
          value={userName}
          onChange={(v) => setUserName(v)}
          placeholder="Ваше имя"
        />
      </div>

      {/* Поле телефона */}
      <div className="mt-4">
        <Field
          label="Телефон"
          value={checkoutForm.phone}
          onChange={(v) => {
            handlePhoneChange(v);
          }}
          placeholder="89951128230"
        />
        {phoneError && (
          <p className="text-xs text-red-500 mt-1">{phoneError}</p>
        )}
      </div>

      {/* Кнопка сохранить */}
      <button
        disabled={!isPhoneValid}
        onClick={() => {
          alert("Изменения сохранены!");
        }}
        className="w-full mt-6 py-3 rounded-2xl font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
        style={{
          backgroundColor: COLORS.accent,
          color: "white",
        }}
      >
        Сохранить изменения
      </button>
    </div>
  );


  const renderProfileFav = () => {
    const favProducts = products.filter((p) =>
      favorites.includes(p.id)
    );

    return (
      <div className="flex-1 overflow-y-auto pb-24 px-4 pt-4">
        <button
          className="mb-3 text-lg"
          onClick={() => setProfileSection("main")}
        >
          ← Назад
        </button>
        <h1 className="text-xl font-semibold mb-4">
          Избранные товары
        </h1>

        {favProducts.length === 0 ? (
          <p style={{ color: COLORS.textSub }}>
            Избранных товаров пока нет.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {favProducts.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
                onAddToCart={addToCart}
                onOpen={setSelectedProduct}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderProfileStores = () => (
    <div className="flex-1 overflow-y-auto pb-24 px-4 pt-4">
      <button
        className="mb-3 text-lg"
        onClick={() => setProfileSection("main")}
      >
        ← Назад
      </button>
      <h1 className="text-xl font-semibold mb-4">
        Магазины
      </h1>
      <div
        className="rounded-3xl p-4"
        style={{ backgroundColor: COLORS.card }}
      >
        <p className="font-medium">{STORE_INFO.title}</p>
        <p style={{ color: COLORS.textSub }}>
          🕒 {STORE_INFO.time}
        </p>
        <p style={{ color: COLORS.textSub }}>
          📞 {STORE_INFO.phone}
        </p>
      </div>
    </div>
  );

  const renderProfile = () => {
    if (profileSection === "info") return renderProfileInfo();
    if (profileSection === "fav") return renderProfileFav();
    if (profileSection === "stores")
      return renderProfileStores();
    return renderProfileMain();
  };

  // ======================================================
  //                       ROOT
  // ======================================================

  return (
    <div
      className="min-h-screen flex flex-col text-sm font-sans overflow-auto"
      style={{
        backgroundColor: COLORS.bg,
        color: COLORS.textMain,
        WebkitOverflowScrolling: "touch"
      }}
    >
      {selectedProduct ? (
        renderProductDetails()
      ) : (
        <>
          {activeTab === "home" && renderHome()}
          {activeTab === "catalog" && renderCatalog()}
          {activeTab === "cart" && renderCart()}
          {activeTab === "support" && renderSupport()}
          {activeTab === "profile" && renderProfile()}

          {/* Bottom tabs */}
          <nav className="fixed bottom-0 left-0 right-0 h-16 flex justify-around items-center bg-white border-t">
            <TabButton
              label="Главная"
              icon={<IconHome />}
              active={activeTab === "home"}
              onClick={() => setActiveTab("home")}
            />

            <TabButton
              label="Каталог"
              icon={<IconGrid />}
              active={activeTab === "catalog"}
              onClick={() => setActiveTab("catalog")}
            />

            <TabButton
              label="Корзина"
              icon={<IconCart />}
              active={activeTab === "cart"}
              badge={cart.length}
              onClick={() => setActiveTab("cart")}
            />

            <TabButton
              label="Поддержка"
              icon={<IconQuestion />}
              active={activeTab === "support"}
              onClick={() => setActiveTab("support")}
            />

            <TabButton
              label="Профиль"
              icon={<IconUser />}
              active={activeTab === "profile"}
              onClick={() => setActiveTab("profile")}
            />
          </nav>
        </>
      )}
      
    {/* 👉 Полноэкранный просмотр фото */}
    {photoViewerOpen && selectedProduct && (
      <FullscreenViewer
        photos={selectedProduct.photos}
        index={photoViewerIndex}
        onClose={() => setPhotoViewerOpen(false)}
      />
    )}
    </div>
  );
}

// ======================================================
//                     COMPONENTS
// ======================================================

function FullscreenViewer({ photos, index, onClose }) {
  const [current, setCurrent] = useState(index);

  const total = photos?.length || 0;
  if (total === 0) return null;

  const next = () => setCurrent(c => (c + 1 < total ? c + 1 : 0));
  const prev = () => setCurrent(c => (c - 1 >= 0 ? c - 1 : total - 1));

  // TOUCH SWIPE LOGIC
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const handleTouchStart = e => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = e => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    const diff = touchEndX.current - touchStartX.current;
    if (Math.abs(diff) > 50) {
      diff < 0 ? next() : prev();
    }
  };


  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex flex-col"
      onClick={onClose}
    >
      {/* Close Button */}
      <div className="flex justify-end p-3">
        <button
          className="text-white text-2xl"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          ✕
        </button>
      </div>

      {/* Image + Swipe Area */}
      <div
        className="flex-1 flex items-center justify-center relative px-3 pb-6"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* PREV BUTTON */}
        {total > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            className="absolute left-4 text-white text-4xl"
          >
            ‹
          </button>
        )}

        <img
          src={photos[current]}
          className="max-w-full max-h-full object-contain"
        />

        {/* NEXT BUTTON */}
        {total > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            className="absolute right-4 text-white text-4xl"
          >
            ›
          </button>
        )}
      </div>

      {/* Counter */}
      {total > 1 && (
        <div className="text-center pb-4 text-white/70 text-sm">
          {current + 1} / {total}
        </div>
      )}
    </div>
  );
}

function SearchInput({ value, onChange }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl px-3 py-2 bg-white">
      <span className="text-gray-500">🔍</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Поиск"
        className="bg-transparent outline-none flex-1 placeholder-gray-400"
      />
    </div>
  );
}

function ProductCard({
  product,
  favorites,
  onToggleFavorite,
  onAddToCart,
  onOpen,
}) {
  const isFav = favorites.includes(product.id);

  return (
    <div
      className="rounded-2xl p-3"
      style={{ backgroundColor: COLORS.card }}
      onClick={() => onOpen(product)}
    >
      <div className="flex justify-between items-start">
        <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-200 flex justify-center items-center">
          {product.photo ? (
            <img
              src={product.photo}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          ) : (
            "📱"
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(product.id);
          }}
          className="text-2xl leading-none"
          style={{
            color: isFav ? COLORS.accent : COLORS.tabInactive,
          }}
        >
          {isFav ? "♥" : "♡"}
        </button>
      </div>

      <p className="text-xs mt-2 font-medium line-clamp-2">
        {product.name}
        {product.capacity
          ? ` ${product.capacity}`
          : ""}
      </p>

      <p
        className="text-[11px] mt-1"
        style={{ color: COLORS.textSub }}
      >
        {conditionLabel(product.condition)}
      </p>

      <p className="mt-1 font-semibold">
        {formatPrice(product.price)}
      </p>

      {product.status === "Свободен" ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAddToCart(product);
          }}
          className="mt-2 w-full py-1.5 rounded-2xl text-xs font-semibold"
          style={{ backgroundColor: COLORS.accent, color: "black" }}
        >
          В корзину
        </button>
      ) : (
        <button
          disabled
          className="mt-2 w-full py-1.5 rounded-2xl text-xs font-semibold opacity-60"
          style={{ backgroundColor: COLORS.card, color: COLORS.textSub }}
        >
          В резерве
        </button>
      )}
    </div>
  );
}

function TabButton({ label, icon, active, onClick, badge }) {
  const activeColor = "#E38B58";
  const inactiveColor = "#9CA3AF";

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center flex-1 relative pt-1"
    >
      {/* ICON */}
      <span
        className="w-7 h-7"
        style={{ color: active ? activeColor : inactiveColor }}
      >
        {icon}
      </span>
      {/* LABEL */}
      <span
        className={`text-[11px] font-medium mt-0.5`}
        style={{ color: active ? activeColor : inactiveColor }}
      >
        {label}
      </span>
      {/* BADGE */}
      {badge > 0 && (
        <span className="absolute right-4 top-0 bg-[#E38B58] text-white rounded-full text-[10px] px-1.5 py-[1px]">
          {badge}
        </span>
      )}
    </button>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div>
      <p className="text-sm font-medium mb-1">
        {label}
      </p>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl px-3 py-2 bg-white outline-none placeholder-gray-400"
      />
    </div>
  );
}

function ChoiceButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 px-3 py-2 rounded-2xl text-xs font-medium"
      style={{
        backgroundColor: active
          ? COLORS.accent
          : COLORS.card,
        color: active ? "white" : COLORS.textMain,
      }}
    >
      {label}
    </button>
  );
}

function Row({ label, value, subtle, bold }) {
  return (
    <div className="flex justify-between">
      <span
        className="text-sm"
        style={{
          color: subtle ? COLORS.textSub : COLORS.textMain,
        }}
      >
        {label}
      </span>
      <span className={bold ? "font-semibold" : ""}>
        {value}
      </span>
    </div>
  );
}

function ProfileRow({ title, subtitle, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full py-3 flex justify-between items-center border-b border-white/60"
    >
      <div className="text-left">
        <p className="font-medium text-sm">{title}</p>
        {subtitle && (
          <p
            className="text-xs"
            style={{ color: COLORS.textSub }}
          >
            {subtitle}
          </p>
        )}
      </div>
      <span>›</span>
    </button>
  );
}
function IconHome({ active }) {
  return (
    <svg
      className="w-7 h-7"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5 10v9h5v-5h4v5h5v-9" />
    </svg>
  );
}

function IconGrid({ active }) {
  return (
    <svg
      className="w-7 h-7"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <rect x="14" y="14" width="6" height="6" rx="1" />
    </svg>
  );
}

function IconCart({ active }) {
  return (
    <svg
      className="w-7 h-7"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="17" cy="20" r="1.5" />
      <path d="M4 5h2l2 11h10l2-8H8" />
    </svg>
  );
}

function IconQuestion({ active }) {
  return (
    <svg
      className="w-7 h-7"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M9.75 9a2.25 2.25 0 1 1 3.9 1.5c-.5.5-1.15.9-1.65 1.4-.25.25-.35.5-.35 1V14" />
      <circle cx="12" cy="16.5" r="0.6" />
    </svg>
  );
}

function IconUser({ active }) {
  return (
    <svg
      className="w-7 h-7"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="9" r="3.5" />
      <path d="M6 20c1.5-3 3.5-4.5 6-4.5s4.5 1.5 6 4.5" />
    </svg>
  );
}
