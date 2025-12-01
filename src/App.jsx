import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp,
  increment,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { 
  Utensils, DollarSign, User, Users, Trash2, CheckCircle, LogOut, 
  ChefHat, Search, Sparkles, Camera, Loader2, X, AlertCircle, Lock, 
  MapPin, Phone, MessageSquare, Minus, Plus, Wifi, Calendar, Clock,
  CheckSquare, Square, Settings
} from 'lucide-react';

// --- 1. CONFIGURATION ---

// [部署設定] 讀取環境變數
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// [部署設定] 前端備用金鑰 (可選)
const CLIENT_SIDE_GEMINI_KEY = ""; 

// 初始化 Firebase
let app, auth, db;
try {
  if (firebaseConfig.apiKey) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } else {
    console.warn("⚠️ Firebase Config 尚未設定，請檢查 .env 或 Netlify 環境變數");
  }
} catch (e) {
  console.error("Firebase 初始化失敗:", e);
}

const APP_ID = 'office-lunch-v1'; 
const DATA_PATH = `artifacts/${APP_ID}/public/data`;
const USERS_COLLECTION = 'lunch_users';
const MENU_COLLECTION = 'lunch_menus';
const ORDERS_COLLECTION = 'lunch_orders';

// --- Helper: 圖片壓縮 ---
const resizeImage = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200; 
        const scaleSize = MAX_WIDTH / img.width;
        
        if (scaleSize < 1) {
          canvas.width = MAX_WIDTH;
          canvas.height = img.height * scaleSize;
        } else {
          canvas.width = img.width;
          canvas.height = img.height;
        }

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// --- Helper: 電話號碼格式化 ---
const formatPhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return '';
  const cleaned = ('' + phoneNumber).replace(/\D/g, '');
  
  // 手機 (10碼) -> 0912-345678
  if (cleaned.length === 10 && cleaned.startsWith('09')) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
  }

  // 市話 (9碼或10碼，含區碼)
  if (cleaned.startsWith('0') && cleaned.length >= 9) {
    if (['02', '04', '07'].includes(cleaned.slice(0, 2))) {
       return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
    }
    if (cleaned.length === 9) {
        return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 5)}-${cleaned.slice(5)}`;
    }
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }

  return phoneNumber;
};

// --- Helper: 取得今日日期字串 (YYYY-MM-DD) ---
const getTodayString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// --- 2. 雙模組 AI 核心 ---
const analyzeImage = async (base64Image) => {
  console.log("啟動 AI 辨識程序...");

  try {
    const response = await fetch('/.netlify/functions/analyze-menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Image })
    });

    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    console.warn("⚠️ 無法連接後端，切換至直連模式...");
  }

  if (CLIENT_SIDE_GEMINI_KEY) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${CLIENT_SIDE_GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: "Analyze this menu image. 1. Extract the Restaurant Name, Phone Number, and Address. 2. Extract all food items and their prices. Return a JSON object with this exact structure: { \"restaurant\": { \"name\": \"string\", \"phone\": \"string\", \"address\": \"string\" }, \"items\": [{ \"name\": \"string\", \"price\": 123 }] }. If address or phone is missing, use empty string. Do not use markdown code blocks." },
                { inlineData: { mimeType: "image/jpeg", data: base64Image } }
              ]
            }]
          })
        }
      );
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      const jsonStr = text.replace(/```json|```/g, '').trim();
      return JSON.parse(jsonStr);
    } catch (e) {
      throw new Error("前端直連失敗：" + e.message);
    }
  }

  throw new Error("❌ AI 辨識失敗：後端無法連線且前端未設定 Key");
};

// --- Components ---

const Modal = ({ isOpen, onClose, title, children, footer }) => {
  if (!isOpen) return null;
  return (
    // [修正] Mobile: items-start + pt-24 (固定頂部距離), Desktop: items-center (垂直置中)
    <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center p-4 pt-24 md:pt-4 bg-black/40 backdrop-blur-sm transition-opacity">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all scale-100 relative z-10 flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto text-gray-600 text-sm">
          {children}
        </div>
        {footer && (
          <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t border-gray-100">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

const Login = ({ onLogin, isConnected }) => {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [existingUsers, setExistingUsers] = useState([]);
  const [rememberMe, setRememberMe] = useState(true);

  useEffect(() => {
    if (!db) return;
    const fetchUsers = async () => {
      try {
        const q = query(collection(db, DATA_PATH, USERS_COLLECTION), orderBy('lastActive', 'desc'));
        const snapshot = await getDocs(q);
        const users = snapshot.docs.map(d => d.data().name).filter(n => n);
        setExistingUsers(users);
      } catch (e) {
        console.error("Failed to fetch users", e);
      }
    };
    fetchUsers();
  }, [isConnected]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    onLogin(name.trim(), rememberMe);
    setLoading(false);
  };

  return (
    // 維持之前的修正：items-start + pt-20
    <div className="min-h-screen bg-orange-50 flex items-start md:items-center justify-center p-4 pt-20 md:pt-0 relative">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border-t-4 border-orange-500">
        <div className="flex justify-center mb-6">
          <div className="bg-orange-100 p-4 rounded-full">
            <Utensils className="w-10 h-10 text-orange-600" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-2">辦公室午餐記帳通</h1>
        <p className="text-center text-gray-500 mb-6">每週結帳．AI 智慧菜單</p>
        
        {existingUsers.length > 0 && (
          <div className="mb-6">
            <p className="text-xs text-gray-400 mb-2 font-medium text-center">快速登入</p>
            <div className="flex flex-wrap gap-2 justify-center max-h-32 overflow-y-auto p-1">
              {existingUsers.map(u => (
                <button
                  key={u}
                  onClick={() => setName(u)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition ${name === u ? 'bg-orange-100 border-orange-300 text-orange-700' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">輸入暱稱</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={(e) => {
                setIsComposing(false);
                setName(e.target.value);
              }}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition"
              placeholder="輸入你的暱稱 (例: 小明)"
              required
            />
          </div>

          <div className="flex items-center">
            <button 
              type="button"
              onClick={() => setRememberMe(!rememberMe)}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800"
            >
              {rememberMe ? <CheckSquare className="w-4 h-4 text-orange-500" /> : <Square className="w-4 h-4 text-gray-400" />}
              記住我 (下次自動登入)
            </button>
          </div>

          <button
            type="submit"
            disabled={loading || !isConnected}
            className="w-full bg-orange-600 text-white py-3 rounded-lg font-semibold hover:bg-orange-700 transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isConnected ? '進入系統' : '連線中...')}
          </button>
        </form>
        <div className="mt-6 flex justify-center items-center gap-2 text-xs text-gray-400">
          {isConnected ? (
            <> <Wifi className="w-3 h-3 text-green-500" /> <span>系統已連線</span> </>
          ) : (
            <> <Loader2 className="w-3 h-3 animate-spin text-orange-500" /> <span>正在連接資料庫...</span> </>
          )}
        </div>
      </div>
    </div>
  );
};

const formatDate = (timestamp) => {
  if (!timestamp) return 'Unknown Date';
  const date = new Date(timestamp.seconds * 1000);
  return date.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short' });
};

export default function App() {
  const [user, setUser] = useState(null);
  
  const [userName, setUserName] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('lunch_username') || sessionStorage.getItem('lunch_username') || '';
    }
    return '';
  });

  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') return sessionStorage.getItem('lunch_active_tab') || 'menu';
    return 'menu';
  });

  const [isAdminMode, setIsAdminMode] = useState(() => {
    if (typeof window !== 'undefined') return sessionStorage.getItem('lunch_is_admin') === 'true';
    return false;
  });
  
  const [currentMenu, setCurrentMenu] = useState({ 
    items: [], imageUrl: '', restaurant: { name: '', phone: '', address: '' }, orderDeadline: '', menuDate: ''
  });
  const [usersMap, setUsersMap] = useState({});
  const [todayOrders, setTodayOrders] = useState([]);
  const [myHistory, setMyHistory] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Admin
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileInputRef = useRef(null);

  // UI
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchComposing, setIsSearchComposing] = useState(false);
  const [modalConfig, setModalConfig] = useState({ isOpen: false, type: null, data: null });
  const [adminPin, setAdminPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [orderQuantity, setOrderQuantity] = useState(1);
  const [orderNote, setOrderNote] = useState('');
  const [isNoteComposing, setIsNoteComposing] = useState(false);

  // Effects
  useEffect(() => {
    sessionStorage.setItem('lunch_active_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    sessionStorage.setItem('lunch_is_admin', isAdminMode);
  }, [isAdminMode]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      if (!auth) return;
      try { await signInAnonymously(auth); } catch (e) { console.error(e); }
    };
    initAuth();
    if (auth) {
      const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
      return () => unsubscribe();
    }
  }, []);

  useEffect(() => {
    if (!user || !userName || !db) return;

    const menuUnsub = onSnapshot(doc(db, DATA_PATH, MENU_COLLECTION, 'today'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const restaurantData = typeof data.restaurant === 'string' 
          ? { name: data.restaurant, phone: '', address: '' } 
          : (data.restaurant || { name: '', phone: '', address: '' });
        
        const todayStr = getTodayString();
        if (data.menuDate && data.menuDate !== todayStr) {
           setCurrentMenu({ 
             items: [], 
             imageUrl: '', 
             restaurant: { name: '', phone: '', address: '' }, 
             orderDeadline: '',
             menuDate: data.menuDate
           });
        } else {
           setCurrentMenu({ 
             ...data, 
             restaurant: restaurantData, 
             orderDeadline: data.orderDeadline || '',
             menuDate: data.menuDate || '' 
           });
        }
      } else {
        setCurrentMenu({ items: [], imageUrl: '', restaurant: { name: '尚未設定', phone: '', address: '' }, orderDeadline: '', menuDate: '' });
      }
    });

    // [重構] UsersMap 資料正規化
    const usersUnsub = onSnapshot(collection(db, DATA_PATH, USERS_COLLECTION), (snapshot) => {
      const map = {};
      snapshot.forEach(doc => {
        const userData = doc.data();
        map[doc.id] = { 
          id: doc.id,
          name: userData.name || 'Unknown',
          balance: typeof userData.balance === 'number' ? userData.balance : 0, 
          lastActive: userData.lastActive
        };
      });
      setUsersMap(map);
    });

    const ordersQuery = query(collection(db, DATA_PATH, ORDERS_COLLECTION), orderBy('createdAt', 'desc'));
    const ordersUnsub = onSnapshot(ordersQuery, (snapshot) => {
      const allOrders = [];
      snapshot.forEach(doc => allOrders.push({ ...doc.data(), id: doc.id }));
      
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const todayList = allOrders.filter(o => o.createdAt && o.createdAt.seconds * 1000 > startOfDay.getTime());
      
      setTodayOrders(todayList);
      setMyHistory(allOrders.filter(o => o.userName === userName));
    });

    const userRef = doc(db, DATA_PATH, USERS_COLLECTION, userName);
    getDoc(userRef).then((snap) => {
      if (!snap.exists()) {
        setDoc(userRef, { name: userName, balance: 0, lastActive: serverTimestamp() });
      } else {
        updateDoc(userRef, { lastActive: serverTimestamp() });
      }
    });

    return () => { menuUnsub(); usersUnsub(); ordersUnsub(); };
  }, [user, userName]);

  const groupedOrders = useMemo(() => {
    const groups = {};
    todayOrders.forEach(order => {
      if (!groups[order.userName]) {
        groups[order.userName] = {
          userName: order.userName,
          items: [],
          totalPrice: 0,
          userId: order.userId
        };
      }
      groups[order.userName].items.push(order);
      groups[order.userName].totalPrice += (order.price || 0);
    });
    return Object.values(groups).sort((a, b) => {
      if (a.userName === userName) return -1;
      if (b.userName === userName) return 1;
      return 0; 
    });
  }, [todayOrders, userName]);

  const groupedHistory = useMemo(() => {
    const groups = {};
    myHistory.forEach(order => {
      const dateStr = formatDate(order.createdAt);
      if (!groups[dateStr]) groups[dateStr] = { orders: [], total: 0, date: dateStr };
      groups[dateStr].orders.push(order);
      groups[dateStr].total += (order.price || 0);
    });
    return Object.values(groups).sort((a, b) => 0);
  }, [myHistory]);

  const filteredItems = (currentMenu.items || []).filter(item => {
    if (!searchTerm) return true;
    return item.name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const myUser = usersMap[userName] || { balance: 0, name: userName };
  const totalDebt = Object.values(usersMap).reduce((acc, curr) => acc + (curr.balance || 0), 0);

  const isOrderingClosed = useMemo(() => {
    if (!currentMenu.orderDeadline) return false;
    if (currentMenu.menuDate && currentMenu.menuDate !== getTodayString()) return true;

    const [hours, minutes] = currentMenu.orderDeadline.split(':');
    const deadline = new Date();
    deadline.setHours(hours, minutes, 0, 0);
    return currentTime > deadline;
  }, [currentMenu.orderDeadline, currentTime, currentMenu.menuDate]);

  const closeModal = () => {
    setModalConfig({ isOpen: false, type: null, data: null });
    setAdminPin(''); setPinError(''); setOrderQuantity(1); setOrderNote('');
  };

  // 處理訂單操作 (刪除單項 / 刪除整單)
  const handleOrderAction = async () => {
    const { type, data } = modalConfig;
    
    try {
      if (type === 'DELETE_SINGLE_ITEM') {
        await deleteDoc(doc(db, DATA_PATH, ORDERS_COLLECTION, data.id));
        await updateDoc(doc(db, DATA_PATH, USERS_COLLECTION, data.userName), { 
          balance: increment(-data.price) 
        });
        closeModal(); 
      } 
      else if (type === 'DELETE_ALL_ORDERS') {
        const batch = writeBatch(db);
        const userOrders = todayOrders.filter(o => o.userName === data.userName);
        let totalRefund = 0;

        userOrders.forEach(order => {
          const orderRef = doc(db, DATA_PATH, ORDERS_COLLECTION, order.id);
          batch.delete(orderRef);
          totalRefund += (order.price || 0);
        });

        const userRef = doc(db, DATA_PATH, USERS_COLLECTION, data.userName);
        batch.update(userRef, { balance: increment(-totalRefund) });

        await batch.commit();
        closeModal();
      }
    } catch (e) {
      console.error("刪除失敗", e);
      alert("刪除失敗，請稍後再試");
    }
  };

  const confirmModal = async () => {
    const { type, data } = modalConfig;
    if (type === 'ADMIN_LOGIN') {
      if (adminPin === '8888') { setIsAdminMode(true); closeModal(); } 
      else { setPinError('通行碼錯誤'); }
    } else if (type === 'PLACE_ORDER') {
      const finalQty = orderQuantity === '' || orderQuantity < 1 ? 1 : orderQuantity;
      const finalPrice = data.price * finalQty;
      await addDoc(collection(db, DATA_PATH, ORDERS_COLLECTION), {
        userId: userName, userName: userName, itemId: data.id, itemName: data.name, unitPrice: data.price,
        quantity: finalQty, note: orderNote, price: finalPrice, createdAt: serverTimestamp()
      });
      await updateDoc(doc(db, DATA_PATH, USERS_COLLECTION, userName), {
        balance: increment(finalPrice), lastActive: serverTimestamp()
      });
      setSearchTerm(''); closeModal();
    } else if (type === 'SETTLE_DEBT') {
      await updateDoc(doc(db, DATA_PATH, USERS_COLLECTION, data.targetUser), { balance: increment(-data.amount) });
      closeModal();
    } else if (type === 'DELETE_SINGLE_ITEM' || type === 'DELETE_ALL_ORDERS') {
      handleOrderAction();
    }
  };

  const handleManageOrder = (group) => {
    setModalConfig({ 
      isOpen: true, 
      type: 'MANAGE_ORDER', 
      data: group 
    });
  };

  const handleDeleteAll = (group) => {
    setModalConfig({ 
      isOpen: true, 
      type: 'CONFIRM_DELETE_ALL', 
      data: group 
    });
  };

  // [修復] 結帳收款：傳入 ID (作為 userRef key) 和 amount
  const handleSettleDebt = (targetUserId, amount, targetUserName) => {
    setModalConfig({ 
      isOpen: true, 
      type: 'SETTLE_DEBT', 
      data: { targetUser: targetUserId, amount, targetUserName } // 傳入 name 供顯示
    });
  };

  const handleLogin = (name, remember) => {
    setUserName(name);
    if (remember) {
      localStorage.setItem('lunch_username', name);
      sessionStorage.setItem('lunch_username', name);
    } else {
      sessionStorage.setItem('lunch_username', name);
      localStorage.removeItem('lunch_username');
    }
  };

  const handleLogout = () => { 
    setUserName(''); setIsAdminMode(false);
    localStorage.removeItem('lunch_username');
    sessionStorage.removeItem('lunch_username');
  };

  const handleToggleAdmin = (e) => {
    if (e.target.checked) setModalConfig({ isOpen: true, type: 'ADMIN_LOGIN' });
    else setIsAdminMode(false);
  };
  const handlePlaceOrder = (item) => {
    if (isOrderingClosed && !isAdminMode) return; 
    setOrderQuantity(1); setOrderNote(''); setModalConfig({ isOpen: true, type: 'PLACE_ORDER', data: item });
  };
  const handleCancelOrder = (orderId, price, orderUser) => {
    if (!isAdminMode && orderUser !== userName) return;
    setModalConfig({ isOpen: true, type: 'CANCEL_ORDER', data: { orderId, price, orderUser } });
  };
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsAnalyzing(true);
    
    try {
      const compressedDataUrl = await resizeImage(file);
      const base64String = compressedDataUrl.replace("data:", "").replace(/^.+,/, "");
      const result = await analyzeImage(base64String);
      
      const newRestaurant = result.restaurant || { name: "AI 辨識餐廳", phone: "", address: "" };
      const newItems = (result.items || []).map((i, idx) => ({ ...i, id: Date.now() + idx }));
      
      await setDoc(doc(db, DATA_PATH, MENU_COLLECTION, 'today'), {
        items: newItems, 
        imageUrl: compressedDataUrl, 
        restaurant: newRestaurant, 
        orderDeadline: currentMenu.orderDeadline || '',
        menuDate: getTodayString()
      }, { merge: true });

    } catch (err) { 
      alert("上傳失敗: " + err.message); 
      console.error(err);
    } finally { 
      setIsAnalyzing(false); 
    }
  };
  const addMenuItem = async () => {
    if (!newItemName || !newItemPrice) return;
    const updatedItems = [...(currentMenu.items || []), { id: Date.now().toString(), name: newItemName, price: parseInt(newItemPrice) }];
    await updateDoc(doc(db, DATA_PATH, MENU_COLLECTION, 'today'), { items: updatedItems });
    setNewItemName(''); setNewItemPrice('');
  };
  const removeMenuItem = async (itemId) => {
    const updatedItems = currentMenu.items.filter(i => i.id !== itemId);
    await updateDoc(doc(db, DATA_PATH, MENU_COLLECTION, 'today'), { items: updatedItems });
  };
  const updateRestaurantInfo = async (key, value) => {
    const updatedRestaurant = { ...currentMenu.restaurant, [key]: value };
    await updateDoc(doc(db, DATA_PATH, MENU_COLLECTION, 'today'), { restaurant: updatedRestaurant });
  };
  const updateDeadline = async (timeStr) => {
    await updateDoc(doc(db, DATA_PATH, MENU_COLLECTION, 'today'), { orderDeadline: timeStr });
  };

  if (!userName) return <Login onLogin={handleLogin} isConnected={!!user} />;
  if (!firebaseConfig.apiKey) return <div className="p-10 text-center">請先設定 .env</div>;

  return (
    <div className="bg-gray-50 h-screen flex flex-col text-gray-800 font-sans overflow-hidden">
      {/* Modals */}
      <Modal isOpen={modalConfig.isOpen && modalConfig.type === 'ADMIN_LOGIN'} onClose={closeModal} title="管理員驗證" footer={<><button onClick={closeModal} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg">取消</button><button onClick={confirmModal} className="px-4 py-2 bg-orange-600 text-white rounded-lg">驗證</button></>}>
        <div className="flex flex-col gap-4"><div className="bg-orange-50 p-3 rounded-lg flex items-center gap-3 text-orange-800 text-sm"><Lock className="w-4 h-4" /><p>請輸入通行碼</p></div><input type="password" autoFocus className="w-full border border-gray-300 p-3 rounded-lg text-center text-2xl tracking-widest outline-none focus:ring-2 focus:ring-orange-500" placeholder="••••" maxLength={4} value={adminPin} onChange={(e) => { setAdminPin(e.target.value); setPinError(''); }} onKeyDown={(e) => e.key === 'Enter' && confirmModal()} />{pinError && <p className="text-red-500 text-sm mt-2 text-center">{pinError}</p>}</div>
      </Modal>
      
      <Modal isOpen={modalConfig.isOpen && modalConfig.type === 'PLACE_ORDER'} onClose={closeModal} title="確認點餐" footer={<><button onClick={closeModal} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg">取消</button><button onClick={confirmModal} className="px-4 py-2 bg-orange-600 text-white rounded-lg">確認下單 (${modalConfig.data?.price * (orderQuantity === '' ? 1 : orderQuantity)})</button></>}>
        <div className="space-y-6"><div className="flex justify-between items-start"><div><p className="text-xs text-gray-400 mb-1">品項</p><p className="text-xl font-bold text-gray-800">{modalConfig.data?.name}</p></div><p className="text-xl font-bold text-orange-600">${modalConfig.data?.price}</p></div><div><p className="text-xs text-gray-400 mb-2">數量</p><div className="flex items-center gap-4"><button onClick={() => setOrderQuantity(Math.max(1, (orderQuantity === '' ? 1 : orderQuantity) - 1))} className="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50"><Minus className="w-4 h-4" /></button><input type="number" min="1" className="w-16 text-center border border-gray-300 rounded-lg py-2 font-bold text-gray-800 outline-none focus:ring-2 focus:ring-orange-500" value={orderQuantity} onChange={(e) => { const val = e.target.value; if (val === '') setOrderQuantity(''); else { const num = parseInt(val); if (!isNaN(num) && num > 0) setOrderQuantity(num); } }} onBlur={() => { if (orderQuantity === '' || orderQuantity < 1) setOrderQuantity(1); }} /><button onClick={() => setOrderQuantity((orderQuantity === '' ? 1 : orderQuantity) + 1)} className="w-10 h-10 rounded-full border border-orange-200 bg-orange-50 flex items-center justify-center text-orange-600 hover:bg-orange-100"><Plus className="w-4 h-4" /></button></div></div><div><p className="text-xs text-gray-400 mb-2">備註 (選填)</p><textarea className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none resize-none h-20" placeholder="例如：不要香菜..." value={orderNote} onChange={(e) => setOrderNote(e.target.value)} onCompositionStart={() => setIsNoteComposing(true)} onCompositionEnd={(e) => { setIsNoteComposing(false); setOrderNote(e.target.value); }} /></div></div>
      </Modal>
      
      {/* [修復] 移除重複定義，只保留這個 SETTLE_DEBT Modal */}
      <Modal isOpen={modalConfig.isOpen && modalConfig.type === 'SETTLE_DEBT'} onClose={closeModal} title="結帳收款" footer={<><button onClick={closeModal} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg">取消</button><button onClick={confirmModal} className="px-4 py-2 bg-green-600 text-white rounded-lg">確認已收款</button></>}><p>確認收到 <span className="font-bold text-gray-800">{modalConfig.data?.targetUserName || modalConfig.data?.targetUser}</span> 的款項？</p><p className="text-2xl font-bold text-green-600 text-center my-4">${modalConfig.data?.amount}</p></Modal>

      {/* [修復] 確保 data.items 存在才進行 map，防止 Cannot read properties of undefined */}
      <Modal isOpen={modalConfig.isOpen && modalConfig.type === 'MANAGE_ORDER'} onClose={closeModal} title={`管理 ${modalConfig.data?.userName} 的訂單`}>
        <div className="space-y-4">
          {modalConfig.data?.items?.map((item) => (
            <div key={item.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
              <div>
                <div className="font-bold text-gray-800">{item.itemName} {item.quantity > 1 && <span className="text-orange-600">x{item.quantity}</span>}</div>
                <div className="text-xs text-gray-500">${item.price} {item.note && `(${item.note})`}</div>
              </div>
              <button 
                onClick={() => {
                  setModalConfig({ type: 'DELETE_SINGLE_ITEM', data: { ...item, allItems: modalConfig.data.items } });
                  confirmModal();
                }} 
                className="p-2 text-red-500 hover:bg-red-100 rounded-full transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="pt-4 border-t text-right">
            <span className="text-sm text-gray-500 mr-2">總計</span>
            <span className="text-xl font-bold text-gray-800">${modalConfig.data?.totalPrice}</span>
          </div>
        </div>
      </Modal>

      <Modal isOpen={modalConfig.isOpen && modalConfig.type === 'CONFIRM_DELETE_ALL'} onClose={closeModal} title="刪除全部訂單" footer={<><button onClick={closeModal} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg">取消</button><button onClick={() => { setModalConfig({ ...modalConfig, type: 'DELETE_ALL_ORDERS' }); confirmModal(); }} className="px-4 py-2 bg-red-600 text-white rounded-lg">確認刪除</button></>}>
        <p>確定要刪除 <span className="font-bold">{modalConfig.data?.userName}</span> 的所有訂單嗎？</p>
        <p className="text-sm text-gray-500 mt-2">總金額 ${modalConfig.data?.totalPrice} 將會從帳本中扣除。</p>
      </Modal>

      {/* Header (Fixed) */}
      <header className="bg-white shadow-sm flex-none z-20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-orange-100 p-2 rounded-lg"><ChefHat className="w-6 h-6 text-orange-600" /></div>
            <div><h1 className="font-bold text-lg leading-tight">午餐記帳通</h1><p className="text-xs text-gray-500">Hi, {userName}</p></div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1 ${myUser.balance > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
              <DollarSign className="w-4 h-4" />{myUser.balance > 0 ? `欠 $${myUser.balance}` : '已結清'}
            </div>
            <button onClick={handleLogout} className="text-gray-400 hover:text-gray-600"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>
      </header>

      {/* Main Container (Flex Col) */}
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full overflow-hidden">
        
        {/* 固定區域 */}
        <div className="flex-none bg-gray-50 z-10 relative">
            <div className="flex justify-end p-2">
              <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none group">
                <input type="checkbox" checked={isAdminMode} onChange={handleToggleAdmin} className="rounded text-orange-500 focus:ring-orange-500 cursor-pointer" />
                <span className="group-hover:text-orange-600 transition">開啟管理員模式</span>
              </label>
            </div>

            <div className="px-4 pb-2">
              <div className="flex bg-gray-200 p-1 rounded-xl shadow-inner">
                <button onClick={() => setActiveTab('menu')} className={`flex-1 py-2 text-sm font-medium rounded-lg flex justify-center items-center gap-2 transition ${activeTab === 'menu' ? 'bg-white shadow text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}><Utensils className="w-4 h-4" /> 點餐</button>
                <button onClick={() => setActiveTab('orders')} className={`flex-1 py-2 text-sm font-medium rounded-lg flex justify-center items-center gap-2 transition ${activeTab === 'orders' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}><Users className="w-4 h-4" /> 狀況 <span className="bg-gray-100 px-1.5 rounded-full text-xs ml-1">{todayOrders.length}</span></button>
                <button onClick={() => setActiveTab('wallet')} className={`flex-1 py-2 text-sm font-medium rounded-lg flex justify-center items-center gap-2 transition ${activeTab === 'wallet' ? 'bg-white shadow text-green-600' : 'text-gray-500 hover:text-gray-700'}`}><DollarSign className="w-4 h-4" /> 結帳</button>
              </div>
            </div>

            {activeTab === 'menu' && (
              <div className="px-4 pt-2">
                {isAdminMode && (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-4 shadow-sm mb-4">
                    <h3 className="text-sm font-bold text-orange-800 flex items-center gap-2"><Sparkles className="w-4 h-4"/> 管理員設置</h3>
                    <div className="space-y-2">
                      <input className="w-full p-2 border rounded text-sm focus:ring-2 focus:ring-orange-200 outline-none" placeholder="餐廳名稱" value={currentMenu.restaurant?.name} onChange={e => updateRestaurantInfo('name', e.target.value)} />
                      <div className="flex gap-2"><input className="flex-1 p-2 border rounded text-sm focus:ring-2 focus:ring-orange-200 outline-none" placeholder="電話" value={currentMenu.restaurant?.phone} onChange={e => updateRestaurantInfo('phone', e.target.value)} /><input className="flex-1 p-2 border rounded text-sm focus:ring-2 focus:ring-orange-200 outline-none" placeholder="地址" value={currentMenu.restaurant?.address} onChange={e => updateRestaurantInfo('address', e.target.value)} /></div>
                      <div className="flex items-center gap-2 p-2 bg-white border rounded"><Clock className="w-4 h-4 text-gray-500" /><span className="text-xs text-gray-500">收單時間：</span><input type="time" className="flex-1 text-sm outline-none" value={currentMenu.orderDeadline} onChange={e => updateDeadline(e.target.value)} /></div>
                    </div>
                    <div className="flex items-center gap-4"><input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageUpload} /><button onClick={() => fileInputRef.current.click()} disabled={isAnalyzing} className="flex-1 bg-gradient-to-r from-orange-500 to-pink-500 text-white py-2.5 rounded-lg text-sm font-bold hover:shadow-md transition flex justify-center items-center gap-2">{isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin"/> : <Camera className="w-4 h-4" />}{isAnalyzing ? 'AI 正在讀取菜單...' : '拍照/上傳菜單 (AI 自動建立)'}</button></div>
                    <div className="pt-2 border-t border-orange-200"><div className="flex gap-2"><input placeholder="品項" className="flex-2 p-2 text-sm border rounded w-full" value={newItemName} onChange={e => setNewItemName(e.target.value)} /><input placeholder="$" type="number" className="flex-1 p-2 text-sm border rounded w-20" value={newItemPrice} onChange={e => setNewItemPrice(e.target.value)} /><button onClick={addMenuItem} className="bg-gray-800 text-white px-3 rounded text-sm">+</button></div></div>
                  </div>
                )}

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
                   <div className="w-full h-32 md:h-48 bg-gray-800 relative group overflow-hidden">
                      {currentMenu.imageUrl ? <img src={currentMenu.imageUrl} alt="Menu" className="w-full h-full object-cover opacity-60 group-hover:opacity-70 transition-opacity duration-500" /> : <div className="w-full h-full flex items-center justify-center text-gray-600 bg-gray-100"><Camera className="w-12 h-12 opacity-20" /></div>}
                      <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 pt-12 text-white">
                        <div className="flex flex-col justify-end h-full">
                          <h2 className="font-bold text-2xl leading-tight mb-2">{currentMenu.restaurant?.name || '今日餐廳'}</h2>
                          <div className="flex flex-col gap-1 text-sm text-gray-200">
                            {currentMenu.restaurant?.phone && (
                              <div className="flex items-center gap-2">
                                <Phone className="w-3.5 h-3.5" /> 
                                {formatPhoneNumber(currentMenu.restaurant.phone)}
                              </div>
                            )}
                            <div className="flex items-center justify-between gap-2 mt-1">
                              {currentMenu.restaurant?.address ? (
                                <div className="flex items-center gap-2 truncate">
                                  <MapPin className="w-3.5 h-3.5 flex-none" /> 
                                  <span className="truncate">{currentMenu.restaurant.address}</span>
                                </div>
                              ) : (
                                <div></div>
                              )}
                              {(currentMenu.restaurant?.name || currentMenu.restaurant?.address) && (
                                <a 
                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([currentMenu.restaurant.name, currentMenu.restaurant.address].filter(Boolean).join(" "))}`} 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-lg whitespace-nowrap"
                                >
                                  <MapPin className="w-3 h-3" /> 地圖
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                   </div>
                   
                   {currentMenu.orderDeadline && (
                    <div className={`px-4 py-2 flex justify-between items-center ${isOrderingClosed ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      <div className="flex items-center gap-2 text-sm font-bold"><Clock className="w-4 h-4" />{isOrderingClosed ? '今日已收單' : `收單時間：${currentMenu.orderDeadline}`}</div>
                      {isOrderingClosed && <span className="text-xs bg-white/50 px-2 py-0.5 rounded">Closed</span>}
                    </div>
                   )}
                </div>

                <div className="bg-white rounded-t-2xl border-b border-gray-100 p-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input 
                      type="text" 
                      placeholder="搜尋..." 
                      className="w-full pl-9 pr-9 py-2.5 bg-gray-100 border-transparent focus:bg-white focus:ring-2 focus:ring-orange-500 rounded-lg text-sm transition outline-none" 
                      value={searchTerm} 
                      onChange={(e) => setSearchTerm(e.target.value)} 
                      onCompositionStart={() => setIsSearchComposing(true)} 
                      onCompositionEnd={(e) => { setIsSearchComposing(false); setSearchTerm(e.target.value); }} 
                    />
                    {searchTerm && <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>}
                  </div>
                </div>
              </div>
            )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6 pt-0 bg-gray-50">
          {activeTab === 'menu' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white rounded-b-2xl shadow-sm overflow-hidden min-h-[200px]">
                <div className="divide-y divide-gray-50">{filteredItems.length > 0 ? filteredItems.map(item => (<div key={item.id} className={`p-4 flex justify-between items-center transition group ${isOrderingClosed ? 'opacity-50 grayscale' : 'hover:bg-orange-50'}`}><div><div className="font-bold text-gray-800 flex items-center gap-2">{item.name} {searchTerm && <span className="text-xs bg-green-100 text-green-700 px-1.5 rounded">符合</span>}</div><div className="text-orange-600 font-semibold">${item.price}</div></div><div className="flex items-center gap-2">{isAdminMode ? (<button onClick={() => removeMenuItem(item.id)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition"><Trash2 className="w-5 h-5" /></button>) : (<button onClick={() => handlePlaceOrder(item)} disabled={isOrderingClosed} className={`px-4 py-1.5 rounded-full text-sm font-bold transition shadow-sm active:scale-95 ${isOrderingClosed ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-white border border-orange-200 text-orange-600 hover:bg-orange-600 hover:text-white'}`}>{isOrderingClosed ? '已截止' : '+ 點餐'}</button>)}</div></div>)) : !searchTerm && <div className="p-8 text-center text-gray-400">{isAdminMode ? '請上傳菜單或新增品項' : '今日尚未建立菜單'}</div>}</div>
              </div>
            </div>
          )}

          {activeTab === 'orders' && (
            <div className="space-y-4 animate-fade-in pt-4">
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex justify-between items-center"><div><h3 className="text-blue-900 font-bold">今日訂單總覽</h3><p className="text-blue-700 text-sm">共 {todayOrders.length} 份餐點</p></div><div className="text-right"><div className="text-2xl font-bold text-blue-600">${todayOrders.reduce((sum, o) => sum + parseInt(o.price || 0), 0)}</div><div className="text-xs text-blue-400">今日總額</div></div></div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {todayOrders.length === 0 ? (<div className="p-8 text-center text-gray-400">今天還沒有人點餐喔</div>) : (
                  <ul className="divide-y divide-gray-100">
                    {groupedOrders.map((group) => (
                      <li key={group.userName} className="p-4 flex items-start justify-between hover:bg-gray-50 transition">
                        <div className="flex items-start gap-3 flex-1">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${group.userName === userName ? 'bg-orange-500' : 'bg-gray-400'}`}>
                            {group.userName.charAt(0)}
                          </div>
                          <div className="flex-1">
                            <div className="font-semibold text-gray-800 flex items-center gap-2">
                              {group.userName}
                              {(isAdminMode || group.userName === userName) && (
                                <div className="flex items-center gap-1 ml-2">
                                   <button onClick={() => handleManageOrder(group)} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-200">
                                     <Settings className="w-3.5 h-3.5" />
                                   </button>
                                   <button onClick={() => handleDeleteAll(group)} className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50">
                                     <Trash2 className="w-3.5 h-3.5" />
                                   </button>
                                </div>
                              )}
                            </div>
                            <div className="text-sm text-gray-600 mt-1 leading-relaxed">
                              {group.items.map((order, idx) => (
                                <span key={order.id}>
                                  {idx > 0 && <span className="mx-1 text-gray-400 font-light">+</span>}
                                  <span>{order.itemName}</span>
                                  {order.quantity > 1 && <span className="text-orange-600 font-bold ml-0.5">x{order.quantity}</span>}
                                </span>
                              ))}
                            </div>
                            {group.items.some(o => o.note) && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {group.items.filter(o => o.note).map(o => (
                                  <span key={o.id} className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                                    {o.itemName}: {o.note}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="font-mono font-medium text-gray-600 shrink-0 ml-2">
                          ${group.totalPrice}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {activeTab === 'wallet' && (
            <div className="space-y-6 animate-fade-in pt-4">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="text-gray-500 font-medium mb-2 flex items-center gap-2"><User className="w-4 h-4"/> 我的帳本</h3>
                <div className="flex items-end justify-between mb-4"><div><div className="text-4xl font-bold text-gray-800">${myUser.balance}</div><div className="text-sm text-gray-400 mt-1">目前累積欠款</div></div>{myUser.balance > 0 ? (<div className="text-right"><span className="inline-block bg-red-100 text-red-600 text-xs px-2 py-1 rounded mb-1">尚未付款</span><p className="text-xs text-gray-400">請找管理員結帳</p></div>) : (<div className="flex items-center gap-1 text-green-600 bg-green-50 px-3 py-1 rounded-full text-sm font-bold"><CheckCircle className="w-4 h-4" /> 無欠款</div>)}</div>
                <div className="border-t pt-4"><h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">每日消費明細</h4><div className="space-y-4">{groupedHistory.length > 0 ? groupedHistory.map(group => (<div key={group.date} className="bg-gray-50 rounded-lg p-3"><div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-200"><span className="text-xs font-bold text-gray-500 flex items-center gap-1"><Calendar className="w-3 h-3"/> {group.date}</span><span className="text-xs font-bold text-gray-800">合計 ${group.total}</span></div><div className="space-y-2">{group.orders.map(h => (<div key={h.id} className="flex justify-between text-sm pl-2 border-l-2 border-orange-200"><span className="text-gray-600">{h.itemName} {h.quantity > 1 && `x${h.quantity}`}</span><span className="text-gray-900 font-medium">${h.price}</span></div>))}</div></div>)) : <div className="text-gray-400 text-sm italic text-center py-4">尚無紀錄</div>}</div></div>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"><div className="p-4 bg-gray-50 border-b flex justify-between items-center"><h3 className="font-bold text-gray-700 flex items-center gap-2"><Users className="w-4 h-4" /> 辦公室總帳</h3><span className="text-xs bg-gray-200 px-2 py-1 rounded text-gray-600">總欠款: ${totalDebt}</span></div><div className="divide-y divide-gray-100">{Object.values(usersMap).sort((a, b) => b.balance - a.balance).map(u => (<div key={u.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold">{u.name.charAt(0)}</div><div><div className="font-medium text-gray-900">{u.name}</div><div className={`text-xs ${u.balance > 0 ? 'text-red-500' : 'text-green-500'}`}>{u.balance > 0 ? '未結清' : '已結清'}</div></div></div><div className="flex items-center gap-4"><div className="text-right"><span className={`font-bold ${u.balance > 0 ? 'text-gray-800' : 'text-gray-300'}`}>${u.balance}</span></div>{isAdminMode && u.balance > 0 && (<button onClick={() => handleSettleDebt(u.id, u.balance, u.name)} className="bg-green-100 text-green-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-green-200 transition">收款</button>)}</div></div>))}</div></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
