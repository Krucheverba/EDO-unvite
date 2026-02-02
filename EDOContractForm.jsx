import React, { useState, useEffect, useRef } from 'react';

// ========================================================
// ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ (вынесены наружу!)
// ========================================================

const FormSection = ({ title, children }) => (
  <div className="g-card p-6 sm:p-8">
    <section className="space-y-6">
      <h2 className="text-xl font-semibold text-[hsl(var(--g-color-text-primary))]">
        {title}
      </h2>
      {children}
    </section>
  </div>
);

const InputField = ({
  label,
  id,
  placeholder,
  type = "text",
  required = false,
  helpText,
  value,
  readOnly = false,
  onChange,
  onBlur
}) => (
  <div>
    <label className="g-label" htmlFor={id}>
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {helpText && (
      <p className="text-xs text-[hsl(var(--g-color-text-hint))] mb-2">
        {helpText}
      </p>
    )}
    <input
      className="g-input"
      id={id}
      placeholder={placeholder}
      type={type}
      value={value}
      readOnly={readOnly}
      onChange={onChange}
      onBlur={onBlur}
    />
  </div>
);

const EDOStatusIndicator = ({ status, isLoading, error }) => {
  if (isLoading) {
    return (
      <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
        Проверка...
      </span>
    );
  }
  
  if (error) {
    return (
      <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full">
        Ошибка проверки
      </span>
    );
  }
  
  if (status?.isConnected) {
    return (
      <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
        ✓ Подключено к ЭДО
      </span>
    );
  }
  
  if (status && !status.isConnected) {
    return (
      <span className="px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
        Не подключено
      </span>
    );
  }
  
  return null;
};

// ========================================================
// ВАЛИДАТОРЫ
// ========================================================

const onlyDigits = (value) => value.replace(/\D/g, '');
const onlyLetters = (value) => value.replace(/[^а-яА-ЯёЁa-zA-Z\s]/g, '');

/**
 * EDOContractForm - Полноценный компонент формы для работы с ЭДО
 * 
 * @param {Object} props
 * @param {string} props.backendUrl - URL бэкенда для API запросов (например: 'http://localhost:3001')
 */
export const EDOContractForm = ({ backendUrl = 'http://localhost:3001' }) => {
  // ========================================================
  // СОСТОЯНИЕ ФОРМЫ
  // ========================================================
  
  const [entityType, setEntityType] = useState("legal-entity");
  const [inn, setInn] = useState("");
  
  const [formData, setFormData] = useState({
    name: "",
    kpp: "",
    ogrn: "",
    address: "",
    fio: ""
  });
  
  const [bankData, setBankData] = useState({
    bik: "",
    bankName: "",
    corrAccount: "",
    account: ""
  });
  
  const [postalData, setPostalData] = useState({
    index: "",
    region: "",
    city: "",
    address: "",
    recipient: ""
  });
  
  const [contactData, setContactData] = useState({
    person: "",
    position: "",
    phone: "",
    email: ""
  });
  
  const [phoneCountryCode, setPhoneCountryCode] = useState("+7");
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);

  // Список стран с кодами
  const countryCodes = [
    { code: '+7', flag: '🇷🇺', name: 'Россия' },
    { code: '+7', flag: '🇰🇿', name: 'Казахстан' },
    { code: '+375', flag: '🇧🇾', name: 'Беларусь' },
    { code: '+380', flag: '🇺🇦', name: 'Украина' },
    { code: '+998', flag: '🇺🇿', name: 'Узбекистан' },
    { code: '+996', flag: '🇰🇬', name: 'Кыргызстан' },
    { code: '+992', flag: '🇹🇯', name: 'Таджикистан' },
    { code: '+374', flag: '🇦🇲', name: 'Армения' },
    { code: '+994', flag: '🇦🇿', name: 'Азербайджан' },
    { code: '+995', flag: '🇬🇪', name: 'Грузия' },
    { code: '+373', flag: '🇲🇩', name: 'Молдова' },
    { code: '+993', flag: '🇹🇲', name: 'Туркменистан' },
  ];
  
  // Состояние отправки формы
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  
  // Способ получения документов
  const [deliveryMethod, setDeliveryMethod] = useState("edo");
  const [selectedEDOOperator, setSelectedEDOOperator] = useState(null);
  const [isManualDeliverySelection, setIsManualDeliverySelection] = useState(false);
  
  // ЭДО статус
  const [edoStatus, setEdoStatus] = useState(null);
  const [edoLoading, setEdoLoading] = useState(false);
  const [edoError, setEdoError] = useState(null);
  
  const debounceTimerRef = useRef(null);
  const bikDebounceTimerRef = useRef(null);
  const postalIndexDebounceRef = useRef(null);

  // ========================================================
  // ВСПОМОГАТЕЛЬНЫЕ ПЕРЕМЕННЫЕ
  // ========================================================
  
  const hasEDO = edoStatus?.isConnected && edoStatus.operators?.length > 0;
  const edoOperators = edoStatus?.operators || [];
  const needsPostalAddress = deliveryMethod === 'post' || deliveryMethod === 'courier';
  const isSBISSelected = deliveryMethod === 'edo' && selectedEDOOperator === '2BM';
  const isOtherEDOSelected = deliveryMethod === 'edo' && selectedEDOOperator && selectedEDOOperator !== '2BM';
  
  // ========================================================
  // ФУНКЦИИ ДЛЯ РАБОТЫ С API
  // ========================================================
  
  // Проверка ЭДО
  const checkEDO = async (innValue) => {
    if (!innValue || innValue.length < 10) return;
    
    setEdoLoading(true);
    setEdoError(null);
    
    try {
      const response = await fetch(`${backendUrl}/api/edo/check?inn=${innValue}`);
      const data = await response.json();
      
      if (response.ok) {
        setEdoStatus(data);
        
        // Заполняем данные компании из ответа
        if (data.companyName) {
          setFormData(prev => ({
            ...prev,
            name: data.companyName || prev.name,
            kpp: data.kpp || prev.kpp,
            ogrn: data.ogrn || prev.ogrn,
            address: data.address || prev.address,
          }));
        }
      } else {
        setEdoError(data.error || 'Ошибка проверки ЭДО');
      }
    } catch (err) {
      setEdoError('Не удалось проверить статус ЭДО');
      console.error('Ошибка проверки ЭДО:', err);
    } finally {
      setEdoLoading(false);
    }
  };
  
  const clearEDO = () => {
    setEdoStatus(null);
    setEdoError(null);
  };

  // Получение данных банка по БИК
  const fetchBankInfo = async () => {
    if (!bankData.bik || bankData.bik.length !== 9) return;
    
    try {
      const url = `https://bik-info.ru/api.html?type=json&bik=${bankData.bik}`;
      const res = await fetch(url);
      const data = await res.json();
      
      if (data && data.name) {
        const decodedName = (data.name || data.namemini || "")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#39;/g, "'");
        
        setBankData(prev => ({
          ...prev,
          bankName: decodedName,
          corrAccount: data.ks || ""
        }));
      }
    } catch (err) {
      console.error("Ошибка при запросе к BIK-INFO API:", err);
    }
  };
  
  // Получение адреса по индексу
  const fetchAddressByIndex = async () => {
    if (!postalData.index || postalData.index.length !== 6) return;
    
    try {
      const response = await fetch(`${backendUrl}/api/postal/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: postalData.index }),
      });
      
      if (response.ok) {
        const data = await response.json();
        
        if (data && data.region && !data.error) {
          setPostalData(prev => ({
            ...prev,
            region: data.region || prev.region,
            city: data.city || prev.city,
          }));
        }
      }
    } catch (err) {
      console.log("Ошибка при запросе адреса по индексу:", err);
    }
  };

  // Форматирование телефона
  const formatPhoneNumber = (value, countryCode) => {
    const digits = value.replace(/\D/g, '');
    let phone = digits;
    
    if (countryCode === '+7' && (phone.startsWith('8') || phone.startsWith('7'))) {
      phone = phone.substring(1);
    }
    if (countryCode === '+375' && phone.startsWith('375')) {
      phone = phone.substring(3);
    }
    if (countryCode === '+380' && phone.startsWith('380')) {
      phone = phone.substring(3);
    }
    if (countryCode === '+7' && phone.startsWith('77')) {
      phone = phone.substring(1);
    }
    
    if (countryCode === '+7') {
      phone = phone.substring(0, 10);
      if (phone.length === 0) return '';
      if (phone.length <= 3) return `(${phone}`;
      if (phone.length <= 6) return `(${phone.substring(0, 3)}) ${phone.substring(3)}`;
      if (phone.length <= 8) return `(${phone.substring(0, 3)}) ${phone.substring(3, 6)}-${phone.substring(6)}`;
      return `(${phone.substring(0, 3)}) ${phone.substring(3, 6)}-${phone.substring(6, 8)}-${phone.substring(8, 10)}`;
    }
    
    phone = phone.substring(0, 12);
    return phone.replace(/(\d{3})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4').trim();
  };
  
  const handlePhoneChange = (e) => {
    const formatted = formatPhoneNumber(e.target.value, phoneCountryCode);
    setContactData(prev => ({ ...prev, phone: formatted }));
  };
  
  const getFullPhoneNumber = () => {
    const digits = contactData.phone.replace(/\D/g, '');
    return `${phoneCountryCode}${digits}`;
  };

  // ========================================================
  // ЭФФЕКТЫ
  // ========================================================
  
  // Автоматическая проверка ЭДО при вводе ИНН
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    if (inn.length === 10 || inn.length === 12) {
      debounceTimerRef.current = setTimeout(() => {
        checkEDO(inn);
      }, 500);
    } else {
      clearEDO();
    }
    
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [inn]);
  
  // Автоматическая подгрузка банка по БИК
  useEffect(() => {
    if (bikDebounceTimerRef.current) {
      clearTimeout(bikDebounceTimerRef.current);
    }
    
    if (bankData.bik.length === 9) {
      bikDebounceTimerRef.current = setTimeout(() => {
        fetchBankInfo();
      }, 500);
    }
    
    return () => {
      if (bikDebounceTimerRef.current) {
        clearTimeout(bikDebounceTimerRef.current);
      }
    };
  }, [bankData.bik]);
  
  // Автоматический выбор способа получения
  useEffect(() => {
    if (isManualDeliverySelection) return;
    
    if (edoStatus?.isConnected && edoStatus.operators.length > 0) {
      setDeliveryMethod('edo');
      const firstOperator = edoStatus.operators[0];
      setSelectedEDOOperator(firstOperator.code);
    } else if (edoStatus && !edoStatus.isConnected) {
      setDeliveryMethod('edo');
      setSelectedEDOOperator('2BM');
    }
  }, [edoStatus, isManualDeliverySelection]);

  // Автоподбор адреса по индексу
  useEffect(() => {
    if (postalIndexDebounceRef.current) {
      clearTimeout(postalIndexDebounceRef.current);
    }
    
    if (postalData.index.length === 6 && /^\d{6}$/.test(postalData.index)) {
      postalIndexDebounceRef.current = setTimeout(() => {
        fetchAddressByIndex();
      }, 500);
    }
    
    return () => {
      if (postalIndexDebounceRef.current) {
        clearTimeout(postalIndexDebounceRef.current);
      }
    };
  }, [postalData.index]);
  
  // ========================================================
  // ОБРАБОТЧИКИ
  // ========================================================
  
  const handleEntityTypeChange = (newType) => {
    setEntityType(newType);
    setFormData({
      name: "",
      kpp: "",
      ogrn: "",
      address: "",
      fio: ""
    });
    setInn("");
    clearEDO();
    setIsManualDeliverySelection(false);
  };
  
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      // Формируем данные для отправки
      const requestData = {
        number: `ПР-${Date.now()}`, // Генерируем номер приглашения
        date: new Date().toISOString().split('T')[0], // Текущая дата в формате YYYY-MM-DD
        receiver: {
          inn: inn,
          kpp: formData.kpp || '',
          name: formData.name || formData.fio || ''
        },
        contractData: {
          contractNumber: `ПР-${Date.now()}`,
          contractDate: new Date().toISOString().split('T')[0],
          subject: 'Соглашение об электронном документообороте',
          sender: {
            name: 'ООО «Партнер Сервис»',
            inn: '5018204283',
            kpp: '501801001'
          },
          receiver: {
            name: formData.name || formData.fio || '',
            inn: inn,
            kpp: formData.kpp || ''
          }
        }
        // mchdGuid берётся из конфига на бэкенде (.env)
      };
      
      console.log('📤 Отправка приглашения с МЧД:', requestData);
      
      // Отправляем на бэкенд
      const response = await fetch(`${backendUrl}/api/sbis-send-invitation-mchd`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'your-api-key-here' // TODO: передавать через props
        },
        body: JSON.stringify(requestData)
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        console.log('✅ Приглашение отправлено:', result);
        setSubmitSuccess(true);
      } else {
        throw new Error(result.error || 'Ошибка отправки приглашения');
      }
      
    } catch (error) {
      console.error('❌ Ошибка:', error);
      setSubmitError(error.message || 'Ошибка обработки формы');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ========================================================
  // RENDER
  // ========================================================
  
  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl w-full mx-auto space-y-8">
        
        <header className="text-center">
          <h1 className="text-3xl font-bold text-[hsl(var(--g-color-text-primary))]">
            Форма приглашения для работы с Dexa.ad
          </h1>
          <p className="text-[hsl(var(--g-color-text-secondary))] mt-2">
            Заполните все необходимые поля для начала работы.
          </p>
        </header>
        
        <form className="space-y-6" onSubmit={handleFormSubmit}>
          
          {/* ТИП ОРГАНИЗАЦИИ */}
          <div className="g-card p-6 sm:p-8">
            <section className="space-y-6">
              <p className="g-label">Тип организации</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  ["legal-entity", "Юридическое лицо"],
                  ["individual-entrepreneur", "Индивидуальный предприниматель"]
                ].map(([value, label]) => (
                  <label className="g-radio-label" key={value}>
                    <input
                      className="g-radio-input"
                      name="entity-type"
                      type="radio"
                      value={value}
                      checked={entityType === value}
                      onChange={(e) => handleEntityTypeChange(e.target.value)}
                    />
                    <span className="font-medium">{label}</span>
                  </label>
                ))}
              </div>
            </section>
          </div>

          {/* ОСНОВНЫЕ ДАННЫЕ */}
          <div className="g-card p-6 sm:p-8">
            <section className="space-y-6">
              <h2 className="text-xl font-semibold text-[hsl(var(--g-color-text-primary))]">
                Основные данные
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <InputField
                  label="ИНН"
                  id="inn"
                  required
                  value={inn}
                  onChange={(e) => setInn(onlyDigits(e.target.value))}
                  placeholder="Введите ИНН"
                />
                <InputField
                  label={entityType === "individual-entrepreneur" ? "ОГРНИП" : "ОГРН"}
                  id="ogrn"
                  required
                  value={formData.ogrn}
                  onChange={(e) => setFormData(prev => ({ ...prev, ogrn: onlyDigits(e.target.value) }))}
                />
              </div>
              
              {entityType === "legal-entity" && (
                <InputField
                  label="Юридическое название"
                  id="org-name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              )}
              
              {entityType === "individual-entrepreneur" && (
                <InputField
                  label="ФИО ИП"
                  id="fio"
                  value={formData.fio}
                  onChange={(e) => setFormData(prev => ({ ...prev, fio: e.target.value }))}
                  required
                />
              )}
              
              <InputField
                label="Юридический адрес"
                id="legal-address"
                value={formData.address}
                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                required
              />

              {/* Способ получения документов */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <p className="g-label mb-0">Способ получения документов</p>
                  {(edoLoading || edoStatus || edoError) && (
                    <EDOStatusIndicator 
                      status={edoStatus} 
                      isLoading={edoLoading} 
                      error={edoError} 
                    />
                  )}
                </div>
                
                <div className="space-y-3">
                  {/* ЭДО - до ввода ИНН */}
                  {!edoStatus && (
                    <div>
                      <label className={`flex items-center gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all duration-200 ${
                        deliveryMethod === 'edo' 
                          ? 'border-blue-500 bg-gradient-to-r from-blue-50 to-indigo-50 shadow-sm' 
                          : 'border-blue-200 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 hover:border-blue-300'
                      }`}>
                        <input
                          type="radio"
                          name="delivery-method"
                          value="edo"
                          checked={deliveryMethod === 'edo'}
                          onChange={() => {
                            setDeliveryMethod('edo');
                            setSelectedEDOOperator('2BM');
                            setIsManualDeliverySelection(true);
                          }}
                          className="w-5 h-5 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-blue-900">Электронный документооборот (ЭДО)</span>
                            <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                              Рекомендуем
                            </span>
                          </div>
                          <p className="text-sm text-blue-700 mt-1">
                            {edoLoading ? 'Проверяем подключение к ЭДО...' : 'Быстрый и удобный обмен документами'}
                          </p>
                        </div>
                      </label>
                    </div>
                  )}

                  {/* ЭДО - если организация НЕ подключена */}
                  {!hasEDO && edoStatus && !edoLoading && (
                    <div>
                      <label className={`flex items-center gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all duration-200 ${
                        deliveryMethod === 'edo' 
                          ? 'border-blue-500 bg-gradient-to-r from-blue-50 to-indigo-50 shadow-sm' 
                          : 'border-blue-200 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 hover:border-blue-300'
                      }`}>
                        <input
                          type="radio"
                          name="delivery-method"
                          value="edo"
                          checked={deliveryMethod === 'edo'}
                          onChange={() => {
                            setDeliveryMethod('edo');
                            setSelectedEDOOperator('2BM');
                            setIsManualDeliverySelection(true);
                          }}
                          className="w-5 h-5 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-blue-900">Электронный документооборот (ЭДО)</span>
                            <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                              Рекомендуем
                            </span>
                          </div>
                          <p className="text-sm text-blue-700 mt-1">
                            Подключитесь к СБИС и получайте документы мгновенно
                          </p>
                        </div>
                      </label>
                      
                      {deliveryMethod === 'edo' && (
                        <div className="mt-3 ml-9 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
                          <h4 className="font-semibold text-blue-900 mb-2">
                            Подключение к ЭДО через СБИС
                          </h4>
                          <p className="text-sm text-blue-800 mb-3">
                            Ваша организация пока не подключена к ЭДО. Оставьте заявку на подключение к оператору 
                            <strong> СБИС (ООО «Компания «Тензор»)</strong> — мы поможем с настройкой.
                          </p>
                          <a 
                            href="https://sbis.ru/edo" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                          >
                            Оставить заявку в СБИС
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ЭДО - если организация подключена */}
                  {hasEDO && (
                    <div>
                      <label className={`flex items-center gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all duration-200 ${
                        deliveryMethod === 'edo' 
                          ? 'border-blue-500 bg-blue-50 shadow-sm' 
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}>
                        <input
                          type="radio"
                          name="delivery-method"
                          value="edo"
                          checked={deliveryMethod === 'edo'}
                          onChange={() => {
                            setDeliveryMethod('edo');
                            if (!selectedEDOOperator && edoOperators.length > 0) {
                              setSelectedEDOOperator(edoOperators[0].code);
                            }
                            setIsManualDeliverySelection(true);
                          }}
                          className="w-5 h-5 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-900">Электронный документооборот (ЭДО)</span>
                            <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                              {edoOperators.length} {edoOperators.length === 1 ? 'оператор' : 'оператора'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 mt-1">
                            Организация подключена к: {edoOperators.map(op => op.name).join(', ')}
                          </p>
                        </div>
                      </label>

                      {/* Выбор оператора ЭДО */}
                      {deliveryMethod === 'edo' && edoOperators.length > 0 && (
                        <div className="mt-3 ml-9 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                          <p className="text-sm font-medium text-gray-700 mb-3">Выберите оператора ЭДО:</p>
                          <div className="space-y-2">
                            {edoOperators.map((operator) => {
                              const isSBIS = operator.code === '2BM' || operator.name.toLowerCase().includes('сбис');
                              const isSelected = selectedEDOOperator === operator.code;
                              
                              return (
                                <label 
                                  key={operator.code}
                                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                                    isSelected 
                                      ? 'border-blue-400 bg-blue-50' 
                                      : 'border-gray-200 hover:border-gray-300 hover:bg-white'
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name="edo-operator"
                                    value={operator.code}
                                    checked={isSelected}
                                    onChange={() => {
                                      setSelectedEDOOperator(operator.code);
                                      setIsManualDeliverySelection(true);
                                    }}
                                    className="w-4 h-4 text-blue-600"
                                  />
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-medium text-gray-900">{operator.name}</span>
                                      <span className="text-xs text-gray-500">({operator.code})</span>
                                    </div>
                                  </div>
                                  {isSelected && (
                                    <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Почтой России */}
                  <div>
                    <label className={`flex items-center gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all duration-200 ${
                      deliveryMethod === 'post' 
                        ? 'border-blue-500 bg-blue-50 shadow-sm' 
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}>
                      <input
                        type="radio"
                        name="delivery-method"
                        value="post"
                        checked={deliveryMethod === 'post'}
                        onChange={() => {
                          setDeliveryMethod('post');
                          setIsManualDeliverySelection(true);
                        }}
                        className="w-5 h-5 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold text-gray-900">Почтой России</span>
                        <p className="text-sm text-gray-500 mt-1">Доставка оригиналов документов почтой</p>
                      </div>
                    </label>
                  </div>
                  
                  {/* Курьером */}
                  <div>
                    <label className={`flex items-center gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all duration-200 ${
                      deliveryMethod === 'courier' 
                        ? 'border-blue-500 bg-blue-50 shadow-sm' 
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}>
                      <input
                        type="radio"
                        name="delivery-method"
                        value="courier"
                        checked={deliveryMethod === 'courier'}
                        onChange={() => {
                          setDeliveryMethod('courier');
                          setIsManualDeliverySelection(true);
                        }}
                        className="w-5 h-5 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold text-gray-900">Курьером</span>
                        <p className="text-sm text-gray-500 mt-1">Курьерская доставка документов</p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Почтовый адрес */}
              <div className="pt-6 border-t border-gray-200">
                <h3 className="text-lg font-semibold text-[hsl(var(--g-color-text-primary))] mb-1">
                  {needsPostalAddress ? "Адрес доставки" : "Почтовый адрес (резервный)"}
                </h3>
                {!needsPostalAddress && (
                  <p className="text-sm text-gray-500 mb-4">
                    На случай, если документы не получится передать по ЭДО
                  </p>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                  <InputField 
                    label="Индекс" 
                    id="post-index" 
                    required={needsPostalAddress} 
                    value={postalData.index}
                    onChange={(e) => setPostalData(prev => ({ ...prev, index: onlyDigits(e.target.value) }))}
                  />
                  <InputField 
                    label="Регион" 
                    id="region" 
                    required={needsPostalAddress} 
                    value={postalData.region}
                    onChange={(e) => setPostalData(prev => ({ ...prev, region: e.target.value }))}
                  />
                  <InputField 
                    label="Населенный пункт" 
                    id="city" 
                    required={needsPostalAddress} 
                    value={postalData.city}
                    onChange={(e) => setPostalData(prev => ({ ...prev, city: e.target.value }))}
                  />
                  <InputField 
                    label="Адрес" 
                    id="address" 
                    placeholder="Улица, дом, квартира" 
                    required={needsPostalAddress} 
                    value={postalData.address}
                    onChange={(e) => setPostalData(prev => ({ ...prev, address: e.target.value }))}
                  />
                </div>
                
                <div className="mt-6">
                  <InputField 
                    label="Получатель" 
                    id="recipient" 
                    placeholder="ФИО полностью" 
                    required={needsPostalAddress} 
                    value={postalData.recipient}
                    onChange={(e) => setPostalData(prev => ({ ...prev, recipient: onlyLetters(e.target.value) }))}
                  />
                </div>
              </div>
            </section>
          </div>

          {/* КОНТАКТНАЯ ИНФОРМАЦИЯ */}
          <FormSection title="Контактная информация">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <InputField 
                label="Контактное лицо" 
                id="contact-person" 
                placeholder="ФИО" 
                required 
                value={contactData.person}
                onChange={(e) => setContactData(prev => ({ ...prev, person: e.target.value }))}
              />
              <InputField 
                label="Должность" 
                id="position" 
                required 
                value={contactData.position}
                onChange={(e) => setContactData(prev => ({ ...prev, position: e.target.value }))}
              />
            </div>
            
            {/* Телефон с выбором кода страны */}
            <div>
              <label className="g-label" htmlFor="phone">
                Телефон <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-[hsl(var(--g-color-text-hint))] mb-2">
                Введите номер без кода страны
              </p>
              <div className="flex">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowCountryDropdown(!showCountryDropdown)}
                    className="h-9 px-3 flex items-center gap-2 rounded-l-md border border-r-0 border-[hsl(var(--g-color-base-simple-border))] bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <span className="text-lg">{countryCodes.find(c => c.code === phoneCountryCode)?.flag}</span>
                    <span className="text-sm font-medium text-gray-700">{phoneCountryCode}</span>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${showCountryDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showCountryDropdown && (
                    <>
                      <div 
                        className="fixed inset-0 z-10" 
                        onClick={() => setShowCountryDropdown(false)}
                      />
                      <div className="absolute top-full left-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20 max-h-64 overflow-y-auto">
                        {countryCodes.map((country) => (
                          <button
                            key={`${country.code}-${country.name}`}
                            type="button"
                            onClick={() => {
                              setPhoneCountryCode(country.code);
                              setContactData(prev => ({ ...prev, phone: '' }));
                              setShowCountryDropdown(false);
                            }}
                            className={`w-full px-3 py-2 flex items-center gap-3 hover:bg-blue-50 transition-colors ${
                              phoneCountryCode === country.code ? 'bg-blue-50' : ''
                            }`}
                          >
                            <span className="text-xl">{country.flag}</span>
                            <span className="flex-1 text-left text-sm text-gray-700">{country.name}</span>
                            <span className="text-sm font-medium text-gray-500">{country.code}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                
                <input
                  className="g-input flex-1 rounded-l-none"
                  id="phone"
                  type="tel"
                  placeholder={phoneCountryCode === '+7' ? '(999) 123-45-67' : '123 456 78 90'}
                  value={contactData.phone}
                  onChange={handlePhoneChange}
                  required
                />
              </div>
            </div>
            
            <InputField
              label="Почта для информации по договору"
              id="email"
              placeholder="example@mail.com"
              type="email"
              required
              helpText="Для уведомлений, копий счетов и актов. Оригиналы отправим Почтой России или по ЭДО."
              value={contactData.email}
              onChange={(e) => setContactData(prev => ({ ...prev, email: e.target.value }))}
            />
          </FormSection>

          {/* БАНК */}
          <FormSection title="Банк">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <InputField 
                  label="БИК" 
                  id="bik" 
                  required 
                  value={bankData.bik}
                  onChange={(e) => setBankData(prev => ({ ...prev, bik: onlyDigits(e.target.value) }))}
                  placeholder="Введите БИК"
                />
                <p className="text-xs text-[hsl(var(--g-color-text-hint))] mt-1">
                  Данные предоставлены <a href="https://bik-info.ru" target="_blank" rel="noopener noreferrer" className="underline">Справочником БИК РФ</a>
                </p>
              </div>
              <InputField 
                label="Расчетный счет" 
                id="checking-account" 
                required 
                value={bankData.account}
                onChange={(e) => setBankData(prev => ({ ...prev, account: onlyDigits(e.target.value) }))}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <InputField 
                label="Наименование банка" 
                id="bank-name" 
                required 
                value={bankData.bankName}
                onChange={(e) => setBankData(prev => ({ ...prev, bankName: e.target.value }))}
              />
              <InputField 
                label="Корреспондентский счет" 
                id="corr-account" 
                required 
                value={bankData.corrAccount}
                onChange={(e) => setBankData(prev => ({ ...prev, corrAccount: onlyDigits(e.target.value) }))}
              />
            </div>
          </FormSection>
          
          {/* Кнопка отправки */}
          <div className="flex flex-col items-end gap-3 pt-2">
            {submitError && (
              <p className="text-red-600 text-sm">{submitError}</p>
            )}
            {!submitSuccess && (
              <button 
                className="g-btn-primary disabled:opacity-50" 
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Отправка приглашения...' : 'Отправить приглашение'}
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Модальное окно успешной отправки */}
      {submitSuccess && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-8 text-center shadow-2xl">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">
              Приглашение отправлено!
            </h3>
            <p className="text-gray-600 mb-6">
              Мы отправили вам приглашение к электронному документообороту в <strong>СБИС</strong>.
            </p>
            <button
              onClick={() => setSubmitSuccess(false)}
              className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EDOContractForm;
