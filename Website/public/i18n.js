/* ============================================================================
   TBRide :: public/i18n.js
   Lightweight localisation for English / Russian / Uzbek. No dependencies.

   The English text already present in the markup (and the English strings
   passed to I18N.t() from app.js) IS the key, so adding a string only means
   adding one line to each dictionary below. Whitespace is normalised, so
   pretty-printed HTML matches single-line dictionary keys.
   ========================================================================== */
(function () {
  'use strict';

  var STORAGE_KEY = 'tbride.lang';
  var TRANSLATED_ATTRS = ['placeholder', 'title', 'alt', 'aria-label'];
  var LANG_LABELS = { en: 'English', ru: 'Русский', uz: "O'zbekcha" };

  var RU = {
    /* chrome */
    'Ride-hailing & operator dispatch · Tashkent': 'Пассажирские перевозки и диспетчерская · Ташкент',
    'Home': 'Главная',
    'Rider': 'Пассажир',
    'Driver': 'Водитель',
    'Operator': 'Диспетчер',
    'Admin': 'Администратор',
    'idle': 'простой',
    'Language': 'Язык',
    'Main navigation': 'Основная навигация',
    'TBRide home': 'TBRide — на главную',
    'TBRide — Ride-Hailing & Operator Dispatch': 'TBRide — Пассажирские перевозки и диспетчерская',
    'admin': 'администратор',
    'Emits': 'Отправляет',

    /* home */
    'Tashkent · live operator dispatch': 'Ташкент · живая диспетчерская',
    'Move across the city with confidence': 'Передвигайтесь по городу уверенно',
    'TBRide puts riders, drivers and operators on one live board: request a trip, watch it get dispatched in real time and follow every ride on the map.':
      'TBRide объединяет пассажиров, водителей и диспетчеров на одной живой доске: закажите поездку, следите за назначением в реальном времени и за маршрутом на карте.',
    'Book a ride': 'Заказать поездку',
    'Become a Driver': 'Стать водителем',
    'Live dispatch board for operators': 'Живая доска назначений для диспетчеров',
    'GPS tracking for every trip': 'GPS-отслеживание каждой поездки',
    'English, Русский and O‘zbekcha': 'Английский, Русский и O‘zbekcha',
    'role consoles': 'ролевых консолей',
    'live ride tracking': 'отслеживание поездок в реальном времени',
    'languages': 'языка',
    'One platform, four consoles': 'Одна платформа, четыре консоли',
    'Pick the workspace that matches your role — every console is purpose-built.':
      'Выберите рабочее пространство под свою роль — каждая консоль создана под задачу.',
    'Set pickup and destination on the map, get an instant fare estimate and track your driver live.':
      'Отметьте подачу и назначение на карте, мгновенно получите оценку стоимости и следите за водителем.',
    'Go online, receive ride offers and manage a trip from arrival to completion.':
      'Выходите на линию, получайте заказы и проводите поездку от подачи до завершения.',
    'Dispatch pending rides with drag & drop, watch the fleet and keep the board moving.':
      'Назначайте поездки перетаскиванием, следите за парком и держите доску в движении.',
    'Manage accounts, review drivers and rides, and audit every event in the system log.':
      'Управляйте аккаунтами, водителями и поездками и проверяйте каждое событие в журнале.',
    'Open console': 'Открыть консоль',
    'How it works': 'Как это работает',
    'Three steps from request to arrival.': 'Три шага от заявки до встречи с водителем.',
    'Set your route': 'Задайте маршрут',
    'Drop the pickup and destination pins on the map — the fare estimate updates instantly.':
      'Поставьте метки подачи и назначения на карте — оценка стоимости обновится сразу.',
    'Operators dispatch': 'Диспетчер назначает водителя',
    'Your request lands on the live board and is assigned to the nearest available driver.':
      'Ваша заявка попадает на живую доску и передаётся ближайшему свободному водителю.',
    'Follow the ride': 'Следите за поездкой',
    'Watch the driver approach in real time and get an update at every stage of the trip.':
      'Наблюдайте за приближением водителя и получайте обновление на каждом этапе поездки.',
    'Drive with TBRide': 'Работайте с TBRide',
    'Bring your car, pass the checks and start earning on the Tashkent dispatch network.':
      'Возьмите свою машину, пройдите проверку и начните зарабатывать в ташкентской сети.',

    /* role page heads */
    'Rider console': 'Консоль пассажира',
    'Request a trip, set your route on the map and follow your driver live.':
      'Закажите поездку, задайте маршрут на карте и следите за водителем в реальном времени.',
    'Operator dispatch': 'Диспетчерская',
    'Run the live board: assign pending rides to drivers with drag & drop.':
      'Ведите живую доску: назначайте поездки водителям перетаскиванием.',
    'Driver console': 'Консоль водителя',
    'Go online, accept ride offers and complete trips safely.':
      'Выходите на линию, принимайте заказы и безопасно завершайте поездки.',
    'Admin console': 'Консоль администратора',
    'Accounts, drivers, rides and the full audit trail.':
      'Аккаунты, водители, поездки и полный журнал действий.',
        /* auth */
    'Phone number': 'Номер телефона',
    'Operator phone number': 'Телефон диспетчера',
    'Driver phone number': 'Телефон водителя',
    'Administrator phone number': 'Телефон администратора',
    'Sign in': 'Войти',
    'Password': 'Пароль',
    'Create a rider account': 'Создать аккаунт пассажира',
    'Full name': 'Полное имя',
    'Create account': 'Создать аккаунт',
    'Use at least 8 characters. Verify phone ownership before production use.':
      'Минимум 8 символов. Подтвердите владение номером перед использованием в продакшене.',
    'Sign out': 'Выйти',

    /* rider console */
    'Drag the markers on the map, or use the placement buttons below.':
      'Перетаскивайте метки на карте или используйте кнопки размещения ниже.',
    'Set pickup': 'Точка подачи',
    'Set destination': 'Точка назначения',
    'Pickup': 'Подача',
    'Destination': 'Назначение',
    'Distance': 'Расстояние',
    'Fare (est.)': 'Стоимость (оценка)',
    'Request ride': 'Заказать поездку',
    'Cancel ride': 'Отменить поездку',
    'Assigned driver': 'Назначенный водитель',
    'Ride history': 'История поездок',
    'No rides yet — drop your markers and request one.': 'Поездок пока нет — расставьте метки и закажите поездку.',
    'Tap the map to move the pickup marker': 'Нажмите на карту, чтобы переместить метку подачи',
    'Tap the map to move the destination marker': 'Нажмите на карту, чтобы переместить метку назначения',
    'Pickup mode': 'Режим подачи',
    'Destination mode': 'Режим назначения',

    /* operator console */
    'pending': 'ожидание',
    'live': 'активные',
    'drivers': 'водители',
    'Drag & drag dispatch': 'Назначение перетаскиванием',
    'Drag & drop dispatch': 'Назначение перетаскиванием',
    'Drag a pending ride card onto a driver marker on the map, or onto a row in the online driver list. You can also click a card and then click a driver marker.':
      'Перетащите карточку заказа на метку водителя на карте или на строку в списке водителей. Либо нажмите карточку, а затем метку водителя.',
    'Pending rides': 'Ожидающие поездки',
    'Live rides': 'Активные поездки',
    'Online drivers': 'Водители в сети',
    'No pending rides.': 'Нет ожидающих поездок.',
    'No live rides.': 'Нет активных поездок.',
    'No online drivers.': 'Нет водителей в сети.',
    'Auto-assign': 'Назначить автоматически',
    'Focus': 'Показать',
    'unassigned': 'не назначен',
    'driver: ': 'водитель: ',

    /* driver console */
    'Go online': 'Выйти на линию',
    'Go offline': 'Завершить смену',
    'Send GPS now': 'Отправить GPS сейчас',
    'Use device GPS': 'GPS устройства',
    'Stop GPS tracking': 'Остановить GPS',
    'Location sharing': 'Передача геопозиции',
    'Share your device location while online so dispatch can track your position.':
      'Передавайте геопозицию устройства, чтобы диспетчеры могли отслеживать вас.',
    'New ride offer': 'Новый заказ',
    'Fare': 'Стоимость',
    'Accept': 'Принять',
    'Decline': 'Отклонить',
    'Active ride': 'Активная поездка',
    'Mark arrived': 'Я прибыл',
    'Start ride': 'Начать поездку',
    'Complete ride': 'Завершить поездку',
    'Cancel': 'Отменить',

    /* admin console */
    'Users': 'Пользователи',
    'Drivers': 'Водители',
    'Rides': 'Поездки',
    'Applications': 'Заявки',
    'Accept application': 'Принять заявку',
    'Reject application': 'Отклонить заявку',
    'Application accepted': 'Заявка принята',
    'Application rejected': 'Заявка отклонена',
    'The applicant must sign out and sign in again to access the Driver console.':
      'Чтобы открыть консоль водителя, заявителю нужно выйти и войти снова.',
    'Application review failed': 'Не удалось обработать заявку',
    'Accept this application? The rider account will become a driver account.':
      'Принять заявку? Аккаунт пассажира станет аккаунтом водителя.',
    'Reject this driver application?': 'Отклонить эту заявку водителя?',
    'The applicant can now sign in through the Driver console with their existing account.':
      'Заявитель теперь может войти в консоль водителя со своей текущей учётной записью.',
    'The rider account remains unchanged.': 'Аккаунт пассажира останется без изменений.',
    'System logs': 'Системные журналы',
    'Password (8+ characters)': 'Пароль (8+ символов)',
    'Vehicle model (driver)': 'Модель автомобиля (водитель)',
    'License plate (driver)': 'Номер авто (водитель)',
    'Create': 'Создать',
    'Delete': 'Удалить',
    'Realtime event log': 'Журнал событий в реальном времени',

    /* map + shared */
    'pickup': 'подача',
    'destination': 'назначение',
    'driver online': 'водитель в сети',
    'driver active': 'водитель занят',
    'route': 'маршрут',
    'Drop on the highlighted driver': 'Перетащите на подсвеченного водителя',
    'Drop on a driver': 'Перетащите на водителя',
    'Drop failed': 'Не удалось перетащить',
    'Drag a pending ride onto a driver': 'Перетащите ожидающий заказ на водителя',
    'No driver marker near the drop point': 'Рядом с точкой сброса нет метки водителя',

    /* become a driver */
    'Send your details to the operators — we review every application by hand.':
      'Отправьте свои данные диспетчерам — каждую заявку мы рассматриваем вручную.',
    'Vehicle model': 'Модель автомобиля',
    'License plate': 'Номер автомобиля',
    'Message (optional)': 'Сообщение (необязательно)',
    'Tell us about your driving experience': 'Расскажите о своём водительском опыте',
    'Send application': 'Отправить заявку',
    'Application sent': 'Заявка отправлена',
    'The operators will review your application and contact you soon.':
      'Диспетчеры рассмотрят заявку и скоро свяжутся с вами.',
    'Sign in first': 'Сначала войдите',
    'Sign in as a rider to apply as a driver': 'Войдите как пассажир, чтобы подать заявку водителем',
    'This account cannot access this console': 'Эта учётная запись не может войти в эту консоль',
    'Application failed': 'Не удалось отправить заявку',
    'Applications failed': 'Не удалось загрузить заявки',

    /* statuses + roles */
    'assigned': 'назначен',
    'accepted': 'принята',
    'rejected': 'отклонена',
    'in_progress': 'в пути',
    'completed': 'завершена',
    'cancelled': 'отменена',
    'offline': 'не в сети',
    'online': 'в сети',
    'active': 'активен',
    'arrived': 'прибыл',
    'user': 'пассажир',
    'system': 'система',
    'info': 'информация',
    'warn': 'предупреждение',
    'error': 'ошибка',
        /* connection + toasts (app.js) */
    'connecting…': 'подключение…',
    'backend online': 'бэкенд в сети',
    'backend down': 'бэкенд недоступен',
    'backend unreachable': 'бэкенд недоступен',
    'live · {role}': 'в сети · {role}',
    'Sign in failed': 'Не удалось войти',
    'Sign up failed': 'Не удалось зарегистрироваться',
    'Not signed in': 'Вы не вошли',
    'Sign in as a rider first': 'Сначала войдите как пассажир',
    'Sign in as an operator': 'Войдите как диспетчер',
    'Ride requested': 'Поездка заказана',
    'waiting for an operator…': 'ждём диспетчера…',
    'Request rejected': 'Заявка отклонена',
    'Ride cancelled': 'Поездка отменена',
    'before driver arrival': 'до прибытия водителя',
    'Ride update': 'Обновление поездки',
    'status: {status}': 'статус: {status}',
    'Ride {status}': 'Поездка: {status}',
    'Ride assigned': 'Поездка назначена',
    'Dispatched': 'Назначено',
    'driver {driver} took ride {ride}': 'водитель {driver} взял поездку {ride}',
    'Dispatch blocked': 'Назначение заблокировано',
    'Ride accepted': 'Поездка принята',
    'you are now active': 'вы на линии',
    'Accept failed': 'Не удалось принять',
    'Declined': 'Отклонено',
    'ride stays pending': 'поездка остаётся в ожидании',
    'Arrived': 'Прибыл',
    'rider notified': 'пассажир уведомлён',
    'Start failed': 'Не удалось начать',
    'Ride completed': 'Поездка завершена',
    'driver back online': 'водитель снова на линии',
    'Complete failed': 'Не удалось завершить',
    'Account created': 'Аккаунт создан',
    'Create failed': 'Не удалось создать',
    'Deleted': 'Удалено',
    'Delete failed': 'Не удалось удалить',
    'Cancel failed': 'Не удалось отменить',
    'Admin overview failed': 'Не удалось загрузить сводку',
    'GPS error': 'Ошибка GPS',
    'Language changed': 'Язык изменён',

    /* event log (app.js) */
    'TBRide client ready · sign in or create a rider account':
      'TBRide готов · войдите или создайте аккаунт пассажира',
    'signed in as {role} · {name}': 'вход выполнен: {role} · {name}',
    'account created · {name}': 'аккаунт создан · {name}',
    'signed out of {role}': 'выход из роли: {role}',
    'sign in failed: {message}': 'ошибка входа: {message}',
    'sign up failed: {message}': 'ошибка регистрации: {message}',
    'ride {id} -> {status}': 'поездка {id} → {status}',
    'device GPS watch attached': 'отслеживание GPS устройства подключено',
    'gps rejected: {message}': 'GPS отклонён: {message}',
    'assign blocked: {message}': 'назначение заблокировано: {message}',
    'driver application sent': 'заявка водителя отправлена',

    /* lists + tables (app.js) */
    'rider': 'пассажир',
    'driver': 'водитель',
    'operator': 'диспетчер',
    'last fix: {time}': 'последняя точка: {time}',
    'sockets': 'сокеты',
    'rides {status}': 'поездки · {status}',
    'col.name': 'Имя',
    'col.phone': 'Телефон',
    'col.role': 'Роль',
    'col.id': 'ID',
    'col.driver': 'Водитель',
    'col.vehicle': 'Автомобиль',
    'col.plate': 'Номер',
    'col.status': 'Статус',
    'col.position': 'Позиция',
    'col.time': 'Время',
    'col.level': 'Уровень',
    'col.event': 'Событие',
    'col.actor': 'Кто',
    'col.entity': 'Объект',
    'col.details': 'Детали',
    'col.route': 'Маршрут',
    'col.rider': 'Пассажир',
    'col.operator': 'Диспетчер',
    'col.applicant': 'Заявитель',
    'col.note': 'Комментарий',
    'col.actions': 'Действия',
    'No records to show': 'Нет записей для отображения',

    /* misc app strings */
    'status broadcast to the dispatch floor': 'статус отправлен на диспетчерскую',
    'Rejected': 'Отклонено',
    'unknown': 'неизвестно',
    'Offline': 'Не в сети',
    'Go online before streaming GPS': 'Выйдите на линию перед отправкой GPS',
    'Unsupported': 'Не поддерживается',
    'No Geolocation API in this browser': 'В этом браузере нет Geolocation API',
    'Delete this account? Related rides keep their history.':
      'Удалить этот аккаунт? История поездок сохранится.'



  };

  var UZ = {
    /* chrome */
    'Ride-hailing & operator dispatch · Tashkent': "Yo'lovchi tashish va dispetcherlik markazi · Toshkent",
    'Home': 'Bosh sahifa',
    'Rider': "Yo'lovchi",
    'Driver': 'Haydovchi',
    'Operator': 'Dispetcher',
    'Admin': 'Administrator',
    'idle': 'band emas',
    'Language': 'Til',
    'Main navigation': 'Asosiy navigatsiya',
    'TBRide home': 'TBRide — bosh sahifa',
    'TBRide — Ride-Hailing & Operator Dispatch': "TBRide — Yo'lovchi tashish va dispetcherlik",
    'admin': 'administrator',
    'Emits': 'Yuboradi',

    /* home */
    'Tashkent · live operator dispatch': 'Toshkent · jonli dispetcherlik',
    'Move across the city with confidence': 'Shahar bo‘ylab ishonch bilan harakatlang',
    'TBRide puts riders, drivers and operators on one live board: request a trip, watch it get dispatched in real time and follow every ride on the map.':
      "TBRide yo'lovchilarni, haydovchilarni va dispetcherlarni bitta jonli doskada birlashtiradi: sayohat buyurtma qiling, biriktirishni real vaqtda kuzating va yo'nalishni xaritada ko'ring.",
    'Book a ride': 'Sayohat buyurtma qilish',
    'Become a Driver': 'Haydovchi bo‘ling',
    'Live dispatch board for operators': 'Dispetcherlar uchun jonli doska',
    'GPS tracking for every trip': 'Har bir sayohat uchun GPS kuzatuvi',
    'English, Русский and O‘zbekcha': 'Ingliz, Рус va O‘zbek tillari',
    'role consoles': 'rol konsollari',
    'live ride tracking': 'safarlarni jonli kuzatish',
    'languages': 'til',
    'One platform, four consoles': 'Bitta platforma, to‘rt konsol',
    'Pick the workspace that matches your role — every console is purpose-built.':
      "Rolingizga mos ish maydonini tanlang — har bir konsol o‘z vazifasi uchun yaratilgan.",
    'Set pickup and destination on the map, get an instant fare estimate and track your driver live.':
      "Xaritada olinadigan joy va manzilni belgilang, narxni darhol oling va haydovchini jonli kuzating.",
    'Go online, receive ride offers and manage a trip from arrival to completion.':
      "Chiqing, buyurtmalarni qabul qiling va sayohatni boshidan oxirigacha boshqaring.",
    'Dispatch pending rides with drag & drop, watch the fleet and keep the board moving.':
      "Kutilayotgan sayohatlarni sudrab-biriktiring, avtoparkni kuzating va doskani harakatda saqlang.",
    'Manage accounts, review drivers and rides, and audit every event in the system log.':
      "Hisoblarni, haydovchilarni va sayohatlarni boshqaring hamda tizim jurnalidagi har bir hodisani tekshiring.",
    'Open console': 'Konsolni ochish',
    'How it works': 'Qanday ishlaydi',
    'Three steps from request to arrival.': 'Buyurtmadan uchrashungacha uch qadam.',
    'Set your route': 'Yo‘nalishni belgilang',
    'Drop the pickup and destination pins on the map — the fare estimate updates instantly.':
      "Xaritaga olinadigan joy va manzil nishonlarini qo‘ying — narx darhol yangilanadi.",
    'Operators dispatch': 'Dispetcher haydovchini biriktiradi',
    'Your request lands on the live board and is assigned to the nearest available driver.':
      'Buyurtmangiz jonli doskaga tushadi va eng yaqin bo‘sh haydovchiga beriladi.',
    'Follow the ride': 'Sayohatni kuzating',
    'Watch the driver approach in real time and get an update at every stage of the trip.':
      'Haydovchining yaqinlashishini real vaqtda kuzating va har bir bosqichda yangilik oling.',
    'Drive with TBRide': 'TBRide bilan ishlang',
    'Bring your car, pass the checks and start earning on the Tashkent dispatch network.':
      'Avtomobilingizni olib keling, tekshiruvdan o‘ting va Toshkent dispetcherlik tarmog‘ida daromad boshlang.',

    /* role page heads */
    'Rider console': "Yo'lovchi konsoli",
    'Request a trip, set your route on the map and follow your driver live.':
      "Sayohat buyurtma qiling, yo'nalishni xaritada belgilang va haydovchini jonli kuzating.",
    'Operator dispatch': 'Dispetcherlik',
    'Run the live board: assign pending rides to drivers with drag & drop.':
      'Jonli doskani boshqaring: kutilayotgan sayohatlarni haydovchilarga sudrab-biriktiring.',
    'Driver console': 'Haydovchi konsoli',
    'Go online, accept ride offers and complete trips safely.':
      'Chiqing, buyurtmalarni qabul qiling va sayohatlarni xavfsiz yakunlang.',
    'Admin console': 'Administrator konsoli',
    'Accounts, drivers, rides and the full audit trail.':
      'Hisoblar, haydovchilar, sayohatlar va to‘liq tekshiruv jurnali.',
        /* auth */
    'Phone number': 'Telefon raqami',
    'Operator phone number': 'Dispetcher telefon raqami',
    'Driver phone number': 'Haydovchi telefon raqami',
    'Administrator phone number': 'Administrator telefon raqami',
    'Sign in': 'Kirish',
    'Password': 'Parol',
    'Create a rider account': "Yo'lovchi hisobi yaratish",
    'Full name': "To'liq ism",
    'Create account': 'Hisob yaratish',
    'Use at least 8 characters. Verify phone ownership before production use.':
      'Kamida 8 ta belgi. Ishlatishdan oldin telefon raqamga egaligingizni tasdiqlang.',
    'Sign out': 'Chiqish',

    /* rider console */
    'Drag the markers on the map, or use the placement buttons below.':
      'Nishonlarni xaritada sudrab yoki quyidagi tugmalardan foydalaning.',
    'Set pickup': 'Olinadigan joyni belgilash',
    'Set destination': 'Manzilni belgilash',
    'Pickup': 'Olinadigan joy',
    'Destination': 'Manzil',
    'Distance': 'Masofa',
    'Fare (est.)': 'Narx (taxminiy)',
    'Request ride': 'Sayohat buyurtma qilish',
    'Cancel ride': 'Sayohatni bekor qilish',
    'Assigned driver': 'Biriktirilgan haydovchi',
    'Ride history': 'Sayohatlar tarixi',
    'No rides yet — drop your markers and request one.': "Hali sayohat yo'q — nishonlarni qo'ying va buyurtma bering.",
    'Tap the map to move the pickup marker': 'Olinadigan joy nishonini ko\'chirish uchun xaritaga bosing',
    'Tap the map to move the destination marker': 'Manzil nishonini ko\'chirish uchun xaritaga bosing',
    'Pickup mode': 'Olinadigan joy rejimi',
    'Destination mode': 'Manzil rejimi',

    /* operator console */
    'pending': 'kutilmoqda',
    'live': 'faol',
    'drivers': 'haydovchilar',
    'Drag & drag dispatch': 'Sudrab-biriktirish',
    'Drag & drop dispatch': 'Sudrab-biriktirish',
    'Drag a pending ride card onto a driver marker on the map, or onto a row in the online driver list. You can also click a card and then click a driver marker.':
      'Kutilayotgan sayohat kartasini xaritadagi haydovchi nishoniga yoki onlayn haydovchilar ro\'yxatidagi qatorga sudrab tashlang. Yoki kartani, so\'ng haydovchi nishonini bosing.',
    'Pending rides': 'Kutilayotgan sayohatlar',
    'Live rides': 'Faol sayohatlar',
    'Online drivers': 'Onlayn haydovchilar',
    'No pending rides.': 'Kutilayotgan sayohatlar yo\'q.',
    'No live rides.': 'Faol sayohatlar yo\'q.',
    'No online drivers.': 'Onlayn haydovchilar yo\'q.',
    'Auto-assign': 'Avtomatik biriktirish',
    'Focus': 'Ko\'rsatish',
    'unassigned': 'biriktirilmagan',
    'driver: ': 'haydovchi: ',

    /* driver console */
    'Go online': 'Chiqish',
    'Go offline': 'Yakunlash',
    'Send GPS now': 'GPS yuborish',
    'Use device GPS': 'Qurilma GPS',
    'Stop GPS tracking': 'GPS kuzatuvini to\'xtatish',
    'Location sharing': 'Joylashuvni ulashish',
    'Share your device location while online so dispatch can track your position.':
      'Dispetcher joylashuvingizni kuzatishi uchun onlayn paytda qurilma joylashuvini ulashing.',
    'New ride offer': 'Yangi sayohat taklifi',
    'Fare': 'Narx',
    'Accept': 'Qabul qilish',
    'Decline': 'Rad etish',
    'Active ride': 'Faol sayohat',
    'Mark arrived': 'Men keldim',
    'Start ride': 'Sayohatni boshlash',
    'Complete ride': 'Sayohatni yakunlash',
    'Cancel': 'Bekor qilish',

    /* admin console */
    'Users': 'Foydalanuvchilar',
    'Drivers': 'Haydovchilar',
    'Rides': 'Sayohatlar',
    'Applications': 'Arizalar',
    'Accept application': 'Arizani qabul qilish',
    'Reject application': 'Arizani rad etish',
    'Application accepted': 'Ariza qabul qilindi',
    'Application rejected': 'Ariza rad etildi',
    'The applicant must sign out and sign in again to access the Driver console.':
      'Haydovchi konsoliga kirish uchun ariza beruvchi tizimdan chiqib, qayta kirishi kerak.',
    'Application review failed': 'Arizani ko‘rib chiqib bo‘lmadi',
    'Accept this application? The rider account will become a driver account.':
      'Ariza qabul qilinsinmi? Yo‘lovchi hisobi haydovchi hisobiga aylanadi.',
    'Reject this driver application?': 'Haydovchi arizasi rad etilsinmi?',
    'The applicant can now sign in through the Driver console with their existing account.':
      'Ariza beruvchi mavjud hisobi bilan Haydovchi konsoliga kirishi mumkin.',
    'The rider account remains unchanged.': 'Yo‘lovchi hisobi o‘zgarishsiz qoladi.',
    'System logs': 'Tizim jurnallari',
    'Password (8+ characters)': 'Parol (8+ belgi)',
    'Vehicle model (driver)': 'Avtomobil modeli (haydovchi)',
    'License plate (driver)': 'Avto raqami (haydovchi)',
    'Create': 'Yaratish',
    'Delete': 'O\'chirish',
    'Realtime event log': 'Hodisalar jurnali (real vaqt)',

    /* map + shared */
    'pickup': 'olinadigan joy',
    'destination': 'manzil',
    'driver online': 'haydovchi onlayn',
    'driver active': 'haydovchi band',
    'route': 'yo\'nalish',
    'Drop on the highlighted driver': 'Belgilangan haydovchiga tashlang',
    'Drop on a driver': 'Haydovchiga tashlang',
    'Drop failed': 'Tashlab bo\'lmadi',
    'Drag a pending ride onto a driver': 'Kutilayotgan sayohatni haydovchiga tashlang',
    'No driver marker near the drop point': 'Tashlash nuqtasi yaqinida haydovchi nishoni yo\'q',

    /* become a driver */
    'Send your details to the operators — we review every application by hand.':
      'Ma\'lumotlaringizni dispetcherlarga yuboring — har bir arizani qo\'lda ko\'rib chiqamiz.',
    'Vehicle model': 'Avtomobil modeli',
    'License plate': 'Avto raqami',
    'Message (optional)': 'Xabar (ixtiyoriy)',
    'Tell us about your driving experience': 'Haydovchilik tajribangiz haqida yozing',
    'Send application': 'Arizani yuborish',
    'Application sent': 'Ariza yuborildi',
    'The operators will review your application and contact you soon.':
      'Dispetcherlar arizangizni ko\'rib chiqadi va tezda siz bilan bog\'lanadi.',
    'Sign in first': 'Avval kiring',
    'Sign in as a rider to apply as a driver': 'Haydovchi bo\'lish uchun yo\'lovchi sifatida kiring',
    'This account cannot access this console': 'Bu hisob ushbu konsolga kira olmaydi',
    'Application failed': 'Arizani yuborib bo\'lmadi',
    'Applications failed': 'Arizalarni yuklab bo\'lmadi',

    /* statuses + roles */
    'assigned': 'biriktirildi',
    'accepted': 'qabul qilindi',
    'rejected': 'rad etildi',
    'in_progress': 'yo\'lda',
    'completed': 'tugallandi',
    'cancelled': 'bekor qilindi',
    'offline': 'oflayn',
    'online': 'onlayn',
    'active': 'faol',
    'arrived': 'keldi',
    'user': 'yo\'lovchi',
    'system': 'tizim',
    'info': 'ma\'lumot',
    'warn': 'ogohlantirish',
    'error': 'xato',
    /* connection + toasts (app.js) */
    'connecting…': 'ulanmoqda…',
    'backend online': 'server onlayn',
    'backend down': 'server ishlamayapti',
    'backend unreachable': 'serverga ulanib bo\'lmadi',
    'live · {role}': 'onlayn · {role}',
    'Sign in failed': 'Kirish amalga oshmadi',
    'Sign up failed': 'Ro\'yxatdan o\'tish amalga oshmadi',
    'Not signed in': 'Siz kirmagansiz',
    'Sign in as a rider first': 'Avval yo\'lovchi sifatida kiring',
    'Sign in as an operator': 'Dispetcher sifatida kiring',
    'Ride requested': 'Sayohat buyurtma qilindi',
    'waiting for an operator…': 'dispetcher kutmoqda…',
    'Request rejected': 'Buyurtma rad etildi',
    'Ride cancelled': 'Sayohat bekor qilindi',
    'before driver arrival': 'haydovchi kelgunga qadar',
    'Ride update': 'Sayohat yangilandi',
    'status: {status}': 'holat: {status}',
    'Ride {status}': 'Sayohat: {status}',
    'Ride assigned': 'Sayohat biriktirildi',
    'Dispatched': 'Biriktirildi',
    'driver {driver} took ride {ride}': 'haydovchi {driver} sayohatni oldi: {ride}',
    'Dispatch blocked': 'Biriktirish bloklandi',
    'Ride accepted': 'Sayohat qabul qilindi',
    'you are now active': 'siz endi liniyadasiz',
    'Accept failed': 'Qabul qilib bo\'lmadi',
    'Declined': 'Rad etildi',
    'ride stays pending': 'sayohat kutilayotgan holatda qoldi',
    'Arrived': 'Keldim',
    'rider notified': 'yo\'lovchi xabardor qilindi',
    'Start failed': 'Boshlab bo\'lmadi',
    'Ride completed': 'Sayohat yakunlandi',
    'driver back online': 'haydovchi yana onlayn',
    'Complete failed': 'Yakunlab bo\'lmadi',
    'Account created': 'Hisob yaratildi',
    'Create failed': 'Yaratib bo\'lmadi',
    'Deleted': 'O\'chirildi',
    'Delete failed': 'O\'chirib bo\'lmadi',
    'Cancel failed': 'Bekor qilib bo\'lmadi',
    'Admin overview failed': 'Umumiy ma\'lumotni yuklab bo\'lmadi',
    'GPS error': 'GPS xatosi',
    'Language changed': 'Til o\'zgartirildi',

    /* event log (app.js) */
    'TBRide client ready · sign in or create a rider account':
      'TBRide tayyor · kiring yoki yo\'lovchi hisobi yarating',
    'signed in as {role} · {name}': 'kirildi: {role} · {name}',
    'account created · {name}': 'hisob yaratildi · {name}',
    'signed out of {role}': 'chiqildi: {role}',
    'sign in failed: {message}': 'kirish xatosi: {message}',
    'sign up failed: {message}': 'ro\'yxatdan o\'tish xatosi: {message}',
    'ride {id} -> {status}': 'sayohat {id} → {status}',
    'device GPS watch attached': 'qurilma GPS kuzatuvi ulandi',
    'gps rejected: {message}': 'GPS rad etildi: {message}',
    'assign blocked: {message}': 'biriktirish bloklandi: {message}',
    'driver application sent': 'haydovchi arizasi yuborildi',

    /* lists + tables (app.js) */
    'rider': 'yo\'lovchi',
    'driver': 'haydovchi',
    'operator': 'dispetcher',
    'last fix: {time}': 'oxirgi nuqta: {time}',
    'sockets': 'socketlar',
    'rides {status}': 'sayohatlar · {status}',
    'col.name': 'Ism',
    'col.phone': 'Telefon',
    'col.role': 'Rol',
    'col.id': 'ID',
    'col.driver': 'Haydovchi',
    'col.vehicle': 'Avtomobil',
    'col.plate': 'Raqam',
    'col.status': 'Holat',
    'col.position': 'Joylashuv',
    'col.time': 'Vaqt',
    'col.level': 'Daraja',
    'col.event': 'Hodisa',
    'col.actor': 'Kim',
    'col.entity': 'Ob\'ekt',
    'col.details': 'Tafsilotlar',
    'col.route': 'Yo\'nalish',
    'col.rider': 'Yo\'lovchi',
    'col.operator': 'Dispetcher',
    'col.applicant': 'Ariza beruvchi',
    'col.note': 'Izoh',
    'col.actions': 'Amallar',
    'No records to show': 'Ko‘rsatish uchun yozuvlar yo‘q',

    /* misc app strings */
    'status broadcast to the dispatch floor': 'holat dispetcherlikka yuborildi',
    'Rejected': 'Rad etildi',
    'unknown': 'noma\'lum',
    'Offline': 'Oflayn',
    'Go online before streaming GPS': 'GPS yuborishdan oldin chiqing',
    'Unsupported': 'Qo\'llab-quvvatlanmaydi',
    'No Geolocation API in this browser': 'Bu brauzerda Geolocation API yo\'q',
    'Delete this account? Related rides keep their history.':
      'Bu hisobni o\'chirishni xohlaysizmi? Sayohatlar tarixi saqlanadi.'
  };

  var dicts = { ru: RU, uz: UZ };
  var listeners = [];
  var titleSource = null;

  function detect() {
    try {
      var saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && (saved === 'en' || dicts[saved])) return saved;
    } catch (err) { /* storage unavailable */ }
    var nav = String(navigator.language || '').toLowerCase();
    if (nav.indexOf('ru') === 0) return 'ru';
    if (nav.indexOf('uz') === 0) return 'uz';
    return 'en';
  }

  var lang = detect();

  /** Whitespace inside HTML text nodes is normalised so pretty-printed
   *  markup matches the single-line keys used in the dictionaries. */
  function normalize(text) {
    return String(text).replace(/\s+/g, ' ').trim();
  }

  function lookup(src) {
    if (lang === 'en') return src;
    var dict = dicts[lang];
    var hit = dict ? dict[src] : undefined;
    return typeof hit === 'string' && hit ? hit : src;
  }

  function interpolate(text, vars) {
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, function (whole, name) {
      return vars[name] !== undefined && vars[name] !== null ? String(vars[name]) : whole;
    });
  }

  /** Translate an English source string (the key) + optional {placeholders}. */
  function t(src, vars) {
    if (typeof src !== 'string') return src;
    return interpolate(lookup(normalize(src)), vars);
  }

  function applyText(node) {
    if (node.__i18nSource === undefined) node.__i18nSource = node.data;
    var source = node.__i18nSource;
    var norm = normalize(source);
    if (!norm) return;
    var out = lookup(norm);
    if (out === norm) {
      if (node.data !== source) node.data = source;
      return;
    }
    var lead = (source.match(/^\s*/) || [''])[0];
    var trail = (source.match(/\s*$/) || [''])[0];
    node.data = lead + out + trail;
  }

  function applyAttributes(el) {
    for (var i = 0; i < TRANSLATED_ATTRS.length; i++) {
      var name = TRANSLATED_ATTRS[i];
      if (!el.hasAttribute(name)) continue;
      if (!el.__i18nAttrs) el.__i18nAttrs = {};
      if (el.__i18nAttrs[name] === undefined) el.__i18nAttrs[name] = el.getAttribute(name);
      var source = el.__i18nAttrs[name];
      var norm = normalize(source);
      if (!norm) continue;
      el.setAttribute(name, lookup(norm));
    }
  }

  function walk(node) {
    if (node.nodeType === 3) { applyText(node); return; }
    if (node.nodeType !== 1) return;
    applyAttributes(node);
    var kids = node.childNodes;
    for (var i = 0; i < kids.length; i++) walk(kids[i]);
  }

  function syncButtons() {
    var buttons = document.querySelectorAll('.lang-btn');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('is-active', buttons[i].getAttribute('data-lang') === lang);
    }
  }

  function apply() {
    if (!document.body) return;
    if (titleSource === null && document.title) titleSource = document.title;
    if (titleSource) document.title = lookup(normalize(titleSource));
    document.documentElement.setAttribute('lang', lang);
    walk(document.body);
    syncButtons();
  }

  function setLang(next) {
    if (!next || next === lang || (next !== 'en' && !dicts[next])) return;
    lang = next;
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch (err) { /* ignore */ }
    apply();
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](next); } catch (err) { /* listener must not break i18n */ }
    }
  }

  function getLang() { return lang; }
  function onChange(fn) { if (typeof fn === 'function') listeners.push(fn); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }

  window.I18N = {
    t: t,
    apply: apply,
    setLang: setLang,
    getLang: getLang,
    onChange: onChange,
    langs: ['en', 'ru', 'uz'],
    labels: LANG_LABELS
  };

})();
