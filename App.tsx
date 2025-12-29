import React, { useState, useEffect, useMemo, useReducer, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  Modal,
  Alert,
  StatusBar,
  SafeAreaView,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Dimensions,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Item, FilterState, SortConfig } from './types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';

// 生成唯一ID
const generateId = () => Math.random().toString(36).substr(2, 9);

// 常量定义
const MODAL_HEIGHT = Dimensions.get('window').height * 0.9;


// 计算剩余天数
const getDaysRemaining = (expiryDate: string) => {
  if (!expiryDate) return 9999;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);

  const diffTime = expiry.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

// 获取过期状态颜色和文本
const getExpiryStatus = (expiryDate: string) => {
  const days = getDaysRemaining(expiryDate);
  if (days < 0) return { color: '#dc2626', bgColor: '#fee2e2', label: '已过期', icon: 'warning', days };
  if (days <= 30) return { color: '#ea580c', bgColor: '#ffedd5', label: '临期', icon: 'warning', days };
  if (days <= 90) return { color: '#ca8a04', bgColor: '#fef9c3', label: '需关注', icon: 'checkmark-circle', days };
  return { color: '#16a34a', bgColor: '#dcfce7', label: '安全', icon: 'checkmark-circle', days };
};

export default function StockManagerApp() {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<string[]>(['食品', '日用品', '药品', '美妆', '清洁']);
  const [locations, setLocations] = useState<string[]>(['冰箱', '储物柜', '浴室', '主卧', '玄关']);
  const [activeTab, setActiveTab] = useState<'home' | 'settings' | 'archived'>('home');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    category: 'all',
    location: 'all',
    status: 'all'
  });
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: 'expiryDate',
    direction: 'asc'
  });


  useEffect(() => {
    const loadData = async () => {
      try {
        const savedItems = await AsyncStorage.getItem('stock_items');
        const savedCategories = await AsyncStorage.getItem('stock_categories');
        const savedLocations = await AsyncStorage.getItem('stock_locations');

        if (savedItems) {
          try {
            const parsedItems = JSON.parse(savedItems);
            setItems(parsedItems);
          } catch (parseError) {
            console.error('解析物品数据失败:', parseError);
            setItems([]);
          }
        }

        if (savedCategories) {
          try {
            const parsedCategories = JSON.parse(savedCategories);
            setCategories(parsedCategories);
          } catch (parseError) {
            console.error('解析分类数据失败:', parseError);
            setCategories(['食品', '日用品', '药品', '美妆', '清洁']);
          }
        }

        if (savedLocations) {
          try {
            const parsedLocations = JSON.parse(savedLocations);
            setLocations(parsedLocations);
          } catch (parseError) {
            console.error('解析位置数据失败:', parseError);
            setLocations(['冰箱', '储物柜', '浴室', '主卧', '玄关']);
          }
        }

      } catch (error) {
        console.error('加载数据失败:', error);
        Alert.alert('警告', '加载保存的数据时出现错误，已恢复默认设置');
      }
    };

    loadData();

    // 初始化通知
    initializeNotifications();
  }, []);

  // 初始化通知系统
  const initializeNotifications = async () => {
    try {
      // 请求通知权限
      const existingStatus = await Notifications.getPermissionsAsync();

      let finalStatus = existingStatus;

      if (existingStatus.status !== 'granted') {
        finalStatus = await Notifications.requestPermissionsAsync();
      }

      setNotificationsEnabled(finalStatus.status === 'granted');

      // 设置通知处理程序
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });

    } catch (error) {
      console.error('初始化通知失败:', error);
    }
  };

  // 添加测试数据（调试用）
  const addTestData = () => {
    const testItem: Item = {
      id: generateId(),
      name: '测试物品',
      category: '食品',
      location: '冰箱',
      quantity: 1,
      unit: '个',
      expiryDate: '2025-12-31',
      image: null,
      note: '测试数据',
      createdAt: new Date().toISOString(),
      notificationsDisabled: false
    };
    setItems(prev => [...prev, testItem]);
    console.log('添加了测试数据');
  };


  // 检查并发送过期提醒
  const checkAndSendExpiryNotifications = async () => {
    if (!notificationsEnabled) {
      console.log('通知已关闭，跳过检查');
      return;
    }

    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      for (const item of items) {
        if (item.archived || (item.notificationsDisabled === true)) {
          continue;
        }

        const daysRemaining = getDaysRemaining(item.expiryDate);

        // 只在到期前30天、15天、7天发送通知
        const notificationTriggers = [30, 15, 7];
        const shouldNotify = notificationTriggers.includes(daysRemaining);

        if (shouldNotify && daysRemaining >= 0) {
          // 检查是否今天已经发送过通知
          const lastNotification = item.lastNotificationDate
            ? new Date(item.lastNotificationDate)
            : null;

          const lastNotificationDate = lastNotification
            ? new Date(lastNotification.getFullYear(), lastNotification.getMonth(), lastNotification.getDate())
            : null;

          const shouldSendToday = !lastNotificationDate || lastNotificationDate.getTime() !== today.getTime();

          if (shouldSendToday) {
            try {
              // 发送通知
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: '🔔 物品过期提醒',
                  body: `"${item.name}" 将在 ${daysRemaining} 天后过期`,
                  sound: 'default',
                  priority: Notifications.AndroidNotificationPriority.HIGH,
                  data: { itemId: item.id, type: 'expiry' },
                },
                trigger: null, // 立即发送
              });

              // 更新最后通知日期
              setItems(prev => prev.map(i =>
                i.id === item.id
                  ? { ...i, lastNotificationDate: today.toISOString() }
                  : i
              ));

            } catch (notifyError) {
              console.error(`发送 "${item.name}" 通知失败:`, notifyError);
            }
          }
        }
      }

    } catch (error) {
      console.error('检查通知失败:', error);
    }
  };

  // 保存数据到本地存储
  const saveData = async () => {
    try {
      await AsyncStorage.setItem('stock_items', JSON.stringify(items));
      await AsyncStorage.setItem('stock_categories', JSON.stringify(categories));
      await AsyncStorage.setItem('stock_locations', JSON.stringify(locations));
    } catch (error) {
      console.error('保存数据失败:', error);
    }
  };




  // 自动保存数据到本地存储
  React.useEffect(() => {
    const saveDataAsync = async () => {
      try {
        await AsyncStorage.setItem('stock_items', JSON.stringify(items));
        await AsyncStorage.setItem('stock_categories', JSON.stringify(categories));
        await AsyncStorage.setItem('stock_locations', JSON.stringify(locations));
      } catch (error) {
        console.error('保存数据失败:', error);
      }
    };

    // 添加延迟，避免过于频繁的保存
    const timeoutId = setTimeout(saveDataAsync, 100);
    return () => clearTimeout(timeoutId);
  }, [items, categories, locations]);

  // 定期检查过期提醒 (测试期间每分钟检查一次)
  React.useEffect(() => {
    const checkNotifications = () => {
      checkAndSendExpiryNotifications();
    };

    // 立即检查一次
    checkNotifications();

    // 每天检查一次过期提醒
    const intervalId = setInterval(checkNotifications, 24 * 60 * 60 * 1000); // 24小时

    return () => clearInterval(intervalId);
  }, [items, notificationsEnabled]);

  // 处理筛选提交
  const handleFilterSubmit = React.useCallback((newFilters: FilterState, newSortConfig: SortConfig) => {
    setFilters(newFilters);
    setSortConfig(newSortConfig);
  }, []);

  // 处理modal提交
  const handleModalSubmit = React.useCallback((data: {
    formData: any;
    isEditing: boolean;
    editingItem?: Item;
  }) => {
    // 同步更新状态
    if (data.formData.category && !categories.includes(data.formData.category)) {
      setCategories(prev => [...prev, data.formData.category]);
    }
    if (data.formData.location && !locations.includes(data.formData.location)) {
      setLocations(prev => [...prev, data.formData.location]);
    }

    if (data.isEditing && data.editingItem) {
      setItems(prev => prev.map(item =>
        item.id === data.editingItem!.id
          ? { ...data.formData, id: item.id, createdAt: item.createdAt }
          : item
      ));
      setEditingItem(null);
    } else {
      const newItem: Item = {
        ...data.formData,
        id: generateId(),
        createdAt: new Date().toISOString(),
        notificationsDisabled: false
      };
      setItems(prev => [...prev, newItem]);
    }

    setShowAddModal(false);
  }, [categories, locations]);

  // 检查全局变量并处理modal提交和关闭 (保留向后兼容)
  React.useEffect(() => {
    const checkGlobalState = () => {
      const submitData = (globalThis as any).__modalSubmitData;
      const shouldClose = (globalThis as any).__closeModal;

      if (submitData) {
        // 同步更新状态
        if (submitData.formData.category && !categories.includes(submitData.formData.category)) {
          setCategories(prev => [...prev, submitData.formData.category]);
    }
        if (submitData.formData.location && !locations.includes(submitData.formData.location)) {
          setLocations(prev => [...prev, submitData.formData.location]);
    }

        if (submitData.isEditing && submitData.editingItem) {
          setItems(prev => prev.map(item =>
            item.id === submitData.editingItem.id
              ? { ...submitData.formData, id: item.id, createdAt: item.createdAt }
          : item
      ));
      setEditingItem(null);
    } else {
          setItems(prev => [...prev, { ...submitData.formData, id: generateId(), createdAt: new Date().toISOString() }]);
    }

    setShowAddModal(false);

        // 清理全局变量
        delete (globalThis as any).__modalSubmitData;
      }

      if (shouldClose) {
        setShowAddModal(false);
        setTimeout(() => {
          setEditingItem(null);
        }, 300);
        delete (globalThis as any).__closeModal;
      }
    };

    // 定期检查全局状态
    const interval = setInterval(checkGlobalState, 100);
    return () => clearInterval(interval);
  }, [categories, locations]);

  const handleDelete = (id: string) => {
    Alert.alert('确认删除', '确定要删除这个物品吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          setItems(items.filter(item => item.id !== id));
          saveData();
        }
      }
    ]);
  };

  const startEdit = (item: Item) => {
    setEditingItem(item);
    setShowAddModal(true);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setTimeout(() => {
      setEditingItem(null);
    }, 300);
  };

  const handleQuantityChange = (itemId: string, change: number) => {
    setItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const newQuantity = Math.max(0, item.quantity + change);

        // 如果数量变为0，询问是否归档
        if (newQuantity === 0) {
          Alert.alert(
            '确认归档',
            '物品数量将变为0，是否将其归档？',
            [
              {
                text: '取消',
                style: 'cancel',
                onPress: () => {
                  // 取消归档，保持数量为1
                  setItems(prev2 => prev2.map(item2 =>
                    item2.id === itemId
                      ? { ...item2, quantity: 1 }
                      : item2
                  ));
                }
              },
              {
                text: '归档',
                style: 'destructive',
                onPress: () => {
                  // 归档物品
                  setItems(prev2 => prev2.map(item2 =>
                    item2.id === itemId
                      ? {
                          ...item2,
                          quantity: 0,
                          archived: true,
                          archivedAt: new Date().toISOString()
                        }
                      : item2
                  ));
                }
              }
            ]
          );
          return item; // 暂时不改变，返回原物品
        }

        return { ...item, quantity: newQuantity };
      }
      return item;
    }));
  };

  const handleRestoreItem = (itemId: string) => {
    setItems(prev => prev.map(item =>
      item.id === itemId
        ? {
            ...item,
            quantity: 1,
            archived: false,
            archivedAt: undefined
          }
        : item
    ));
  };

  const processedItems = useMemo(() => {
    // 只显示未归档的物品
    let result = [...items].filter(item => !item.archived);

    if (filters.search) {
      result = result.filter(item => item.name.toLowerCase().includes(filters.search.toLowerCase()));
    }
    if (filters.category !== 'all') {
      result = result.filter(item => item.category === filters.category);
    }
    if (filters.location !== 'all') {
      result = result.filter(item => item.location === filters.location);
    }
    if (filters.status !== 'all') {
      result = result.filter(item => {
        const days = getDaysRemaining(item.expiryDate);
        if (filters.status === 'expired') return days < 0;
        if (filters.status === 'expiring') return days >= 0 && days <= 30;
        if (filters.status === 'safe') return days > 30;
        return true;
      });
    }

    result.sort((a, b) => {
      let valA: any = a[sortConfig.key];
      let valB: any = b[sortConfig.key];

      if (sortConfig.key === 'expiryDate') {
        valA = new Date(valA || '2099-12-31').getTime();
        valB = new Date(valB || '2099-12-31').getTime();
      }

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [items, filters, sortConfig]);

  const stats = useMemo(() => {
    const expired = items.filter(i => getDaysRemaining(i.expiryDate) < 0).length;
    const expiring = items.filter(i => {
      const d = getDaysRemaining(i.expiryDate);
      return d >= 0 && d <= 30;
    }).length;
    return { expired, expiring, total: items.length };
  }, [items]);


  const Header = () => (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <Text style={styles.headerTitle}>囤货管家</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => {
              setSortConfig(prev => ({
                ...prev,
                direction: prev.direction === 'asc' ? 'desc' : 'asc'
              }));
            }}
            style={styles.iconButton}
          >
            <Ionicons name="swap-vertical" size={20} color="#475569" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowFilterModal(true)}
            style={[
              styles.iconButton,
              Object.values(filters).some(v => v !== 'all' && v !== '') && styles.iconButtonActive
            ]}
          >
            <Ionicons name="filter" size={20} color="#475569" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color="#94a3b8" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="搜索物品名称..."
          placeholderTextColor="#94a3b8"
          value={filters.search}
          onChangeText={(text) => setFilters({ ...filters, search: text })}
        />
      </View>

      <View style={styles.statsContainer}>
        <View style={[styles.statBadge, { backgroundColor: '#fee2e2' }]}>
          <Text style={[styles.statText, { color: '#dc2626' }]}>已过期: {stats.expired}</Text>
        </View>
        <View style={[styles.statBadge, { backgroundColor: '#ffedd5' }]}>
          <Text style={[styles.statText, { color: '#ea580c' }]}>即将过期: {stats.expiring}</Text>
        </View>
        <View style={[styles.statBadge, { backgroundColor: '#f1f5f9' }]}>
          <Text style={[styles.statText, { color: '#475569' }]}>总数: {stats.total}</Text>
        </View>
      </View>
    </View>
  );

  const ItemList = () => (
    <ScrollView style={styles.itemList} contentContainerStyle={styles.itemListContent}>
      {processedItems.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="cube-outline" size={48} color="#cbd5e1" />
          <Text style={styles.emptyText}>暂无物品，快去添加吧</Text>
        </View>
      ) : (
        processedItems.map(item => {
          const status = getExpiryStatus(item.expiryDate);
          return (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.itemImageContainer}>
                {item.image ? (
                  <Image source={{ uri: item.image }} style={styles.itemImage as any} />
                ) : (
                  <View style={styles.itemImagePlaceholder}>
                    <Ionicons name="camera-outline" size={24} color="#cbd5e1" />
                  </View>
                )}
                <View style={[styles.statusBadge, { backgroundColor: status.bgColor }]}>
                  <Ionicons name={status.icon as any} size={12} color={status.color} />
                  <Text style={[styles.statusText, { color: status.color }]}>
                    {item.expiryDate
                      ? status.days < 0
                        ? `过期 ${Math.abs(status.days)} 天`
                        : `剩 ${status.days} 天`
                      : '无日期'}
                  </Text>
                </View>
              </View>

              <View style={styles.itemContent}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <View style={styles.quantityBadge}>
                    <Text style={styles.quantityText}>x {item.quantity} {item.unit}</Text>
                  </View>
                </View>

                <View style={styles.itemInfo}>
                  <View style={styles.infoRow}>
                    <Ionicons name="pricetag-outline" size={14} color="#94a3b8" />
                    <Text style={styles.infoText}>{item.category || '未分类'}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons name="location-outline" size={14} color="#94a3b8" />
                    <Text style={styles.infoText}>{item.location || '未设置位置'}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons name="calendar-outline" size={14} color="#94a3b8" />
                    <Text style={styles.infoText}>{item.expiryDate || '未设置日期'}</Text>
                  </View>
                </View>

                <View style={styles.itemActions}>
                    <View style={styles.quantityControls}>
                      <TouchableOpacity
                        onPress={() => handleQuantityChange(item.id, 1)}
                        style={styles.quantityButton}
                      >
                        <Text style={styles.quantityButtonText}>+1</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleQuantityChange(item.id, -1)}
                        style={styles.quantityButton}
                      >
                        <Text style={styles.quantityButtonText}>-1</Text>
                      </TouchableOpacity>
                    </View>
                  <TouchableOpacity
                    onPress={() => startEdit(item)}
                    style={styles.actionButton}
                  >
                    <Ionicons name="create-outline" size={14} color="#3b82f6" />
                    <Text style={styles.actionText}>编辑</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(item.id)}
                    style={styles.actionButton}
                  >
                    <Ionicons name="trash-outline" size={14} color="#ef4444" />
                    <Text style={[styles.actionText, { color: '#ef4444' }]}>删除</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );

  // AddEditModal 组件 - 完全独立的状态管理
  const AddEditModal = React.memo(({
    visible,
    editingItem,
    onSubmit,
    onClose
  }: {
    visible: boolean;
    editingItem?: Item | null;
    onSubmit: (data: any) => void;
    onClose: () => void;
  }) => {
    // 独立的本地状态，完全不依赖父组件
    const [modalFormData, setModalFormData] = useState(() => ({
      name: '',
      category: '',
      location: '',
      quantity: 1,
      unit: '个',
      expiryDate: '',
      image: null as string | null,
      note: '',
      notificationsDisabled: false
    }));

    const [showCategoryPicker, setShowCategoryPicker] = useState(false);
    const [showLocationPicker, setShowLocationPicker] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedDay, setSelectedDay] = useState(new Date().getDate());

    // 初始化数据
    React.useEffect(() => {
      if (visible) {
        if (editingItem) {
          // 编辑模式：加载现有数据
          setModalFormData({
            name: editingItem.name,
            category: editingItem.category,
            location: editingItem.location,
            quantity: editingItem.quantity,
            unit: editingItem.unit,
            expiryDate: editingItem.expiryDate,
            image: editingItem.image,
            note: editingItem.note || '',
            notificationsDisabled: editingItem.notificationsDisabled || false
          });
        } else {
          // 新建模式：重置数据
          setModalFormData({
            name: '',
            category: '',
            location: '',
            quantity: 1,
            unit: '个',
            expiryDate: '',
            image: null,
            note: '',
            notificationsDisabled: false
          });
        }
        // 重置选择器状态
        setShowCategoryPicker(false);
        setShowLocationPicker(false);
        setShowDatePicker(false);
      }
    }, [visible, editingItem]);

    // 图片处理函数
    const handleImageUpload = React.useCallback(async () => {
      try {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('权限', '需要访问照片库权限');
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
          base64: true,
        });

        if (!result.canceled && result.assets[0]) {
          const base64 = `data:image/jpeg;base64,${result.assets[0].base64}`;
          setModalFormData(prev => ({ ...prev, image: base64 }));
        }
      } catch (error) {
        Alert.alert('错误', '选择图片失败');
      }
    }, []);

    const handleCameraCapture = React.useCallback(async () => {
      try {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('权限', '需要相机权限');
          return;
        }

        const result = await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
          base64: true,
        });

        if (!result.canceled && result.assets[0]) {
          const base64 = `data:image/jpeg;base64,${result.assets[0].base64}`;
          setModalFormData(prev => ({ ...prev, image: base64 }));
        }
      } catch (error) {
        Alert.alert('错误', '拍照失败');
      }
    }, []);


    const handleCategorySelect = React.useCallback((category: string) => {
      if (category === 'add_new') {
        setShowCategoryPicker(false);
        // 这里不能直接调用setActiveTab，因为它在父组件作用域外
        // 暂时简化处理，用户需要手动去设置页面
        Alert.alert('提示', '请先关闭此页面，然后去设置页面添加新分类');
      } else {
        setModalFormData(prev => ({ ...prev, category }));
        setShowCategoryPicker(false);
      }
    }, []);

    const handleLocationSelect = React.useCallback((location: string) => {
      if (location === 'add_new') {
        setShowLocationPicker(false);
        Alert.alert('提示', '请先关闭此页面，然后去设置页面添加新位置');
      } else {
        setModalFormData(prev => ({ ...prev, location }));
        setShowLocationPicker(false);
      }
    }, []);

    const handleDateConfirm = React.useCallback(() => {
      const formattedDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
      setModalFormData(prev => ({ ...prev, expiryDate: formattedDate }));
      setShowDatePicker(false);
    }, [selectedYear, selectedMonth, selectedDay]);

    const handleSubmit = React.useCallback(() => {
      if (!modalFormData.name.trim()) {
        Alert.alert('提示', '请输入物品名称');
        return;
      }

      // 直接调用父组件的onSubmit函数
      onSubmit({
        formData: modalFormData,
        isEditing: !!editingItem,
        editingItem: editingItem
      });

      // 关闭modal
      onClose();

    }, [modalFormData, editingItem, onSubmit, onClose]);

    const getDaysInMonth = React.useCallback((year: number, month: number) => {
      return new Date(year, month, 0).getDate();
    }, []);

    const generateYears = React.useCallback(() => {
      const currentYear = new Date().getFullYear();
      return Array.from({ length: 10 }, (_, i) => currentYear + i);
    }, []);

    const generateMonths = React.useCallback(() => {
      return Array.from({ length: 12 }, (_, i) => i + 1);
    }, []);

    const generateDays = React.useCallback(() => {
      const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
      return Array.from({ length: daysInMonth }, (_, i) => i + 1);
    }, [selectedYear, selectedMonth, getDaysInMonth]);

    return (
      <Modal
        visible={visible}
        transparent={true}
        onRequestClose={onClose}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBackdrop}>
          <View style={styles.modalContentTouchable}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingItem ? '编辑物品' : '入库登记'}
              </Text>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="chevron-down" size={24} color="#475569" />
              </TouchableOpacity>
            </View>

              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
                style={styles.keyboardAvoidingContainer}
              >
                <ScrollView
                  style={styles.form}
                  contentContainerStyle={styles.formContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="interactive"
                  bounces={true}
                  alwaysBounceVertical={false}
                >
              {/* 图片上传 */}
              <TouchableOpacity
                onPress={() => {
                  Alert.alert('选择图片', '请选择图片来源', [
                    { text: '取消', style: 'cancel' },
                    { text: '拍照', onPress: handleCameraCapture },
                    { text: '从相册选择', onPress: handleImageUpload }
                  ]);
                }}
                style={styles.imageUploadArea}
              >
                  {modalFormData.image ? (
                    <Image source={{ uri: modalFormData.image }} style={styles.imagePreview as any} />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Ionicons name="camera" size={24} color="#3b82f6" />
                    <Text style={styles.imagePlaceholderText}>拍摄或上传照片</Text>
                  </View>
                )}
              </TouchableOpacity>

              <View style={styles.formGroup}>
                <Text style={styles.label}>物品名称</Text>
                <TextInput
                  style={styles.input}
                    value={modalFormData.name}
                    onChangeText={(text) => setModalFormData(prev => ({ ...prev, name: text }))}
                  placeholder="例如：蓝月亮洗衣液"
                  placeholderTextColor="#94a3b8"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    enablesReturnKeyAutomatically={true}
                />
              </View>

              <View style={styles.row}>
                <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
                  <Text style={styles.label}>数量</Text>
                  <TextInput
                    style={[styles.input, styles.centeredInput]}
                      value={modalFormData.quantity.toString()}
                      onChangeText={(text) => setModalFormData(prev => ({ ...prev, quantity: Number(text) || 0 }))}
                    keyboardType="numeric"
                      returnKeyType="next"
                      maxLength={3}
                      blurOnSubmit={false}
                      enablesReturnKeyAutomatically={true}
                  />
                </View>
                <View style={[styles.formGroup, { flex: 1, marginLeft: 8 }]}>
                  <Text style={styles.label}>单位</Text>
                  <TextInput
                    style={[styles.input, styles.centeredInput]}
                      value={modalFormData.unit}
                      onChangeText={(text) => setModalFormData(prev => ({ ...prev, unit: text }))}
                    placeholder="个/瓶"
                    placeholderTextColor="#94a3b8"
                      returnKeyType="next"
                      maxLength={5}
                      blurOnSubmit={false}
                      enablesReturnKeyAutomatically={true}
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>分类</Text>
                  <TouchableOpacity
                    style={styles.pickerButton}
                    onPress={() => setShowCategoryPicker(true)}
                  >
                    <Text style={[styles.pickerButtonText, !modalFormData.category && styles.pickerButtonPlaceholder]}>
                      {modalFormData.category || '请选择分类'}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color="#94a3b8" />
                  </TouchableOpacity>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>存放位置</Text>
                  <TouchableOpacity
                    style={styles.pickerButton}
                    onPress={() => setShowLocationPicker(true)}
                  >
                    <Text style={[styles.pickerButtonText, !modalFormData.location && styles.pickerButtonPlaceholder]}>
                      {modalFormData.location || '请选择存放位置'}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color="#94a3b8" />
                  </TouchableOpacity>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>过期日期</Text>
                  <TouchableOpacity
                    style={styles.pickerButton}
                    onPress={() => {
                      const date = modalFormData.expiryDate ? new Date(modalFormData.expiryDate) : new Date();
                      setSelectedYear(date.getFullYear());
                      setSelectedMonth(date.getMonth() + 1);
                      setSelectedDay(date.getDate());
                      setShowDatePicker(true);
                    }}
                  >
                    <Text style={[styles.pickerButtonText, !modalFormData.expiryDate && styles.pickerButtonPlaceholder]}>
                      {modalFormData.expiryDate || '请选择过期日期'}
                    </Text>
                    <Ionicons name="calendar-outline" size={18} color="#94a3b8" />
                  </TouchableOpacity>
              </View>

              <View style={styles.formGroup}>
                <View style={styles.switchRow}>
                  <Text style={styles.label}>过期提醒</Text>
                  <TouchableOpacity
                    style={[styles.switchContainer, modalFormData.notificationsDisabled && styles.switchContainerDisabled]}
                    onPress={() => setModalFormData(prev => ({ ...prev, notificationsDisabled: !prev.notificationsDisabled }))}
                  >
                    <View style={[styles.switchTrack, modalFormData.notificationsDisabled && styles.switchTrackDisabled]}>
                      <View style={[styles.switchThumb, modalFormData.notificationsDisabled && styles.switchThumbDisabled]} />
                    </View>
                    <Text style={[styles.switchText, modalFormData.notificationsDisabled && styles.switchTextDisabled]}>
                      {modalFormData.notificationsDisabled ? '已关闭' : '开启'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.hintText}>
                  {modalFormData.notificationsDisabled
                    ? '已关闭过期提醒，将不会收到通知'
                    : '开启后将在到期前30、15、7天发送提醒'
                  }
                </Text>
              </View>

              <TouchableOpacity
                onPress={handleSubmit}
                style={styles.submitButton}
              >
                <Text style={styles.submitButtonText}>
                  {editingItem ? '保存修改' : '确认入库'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
              </KeyboardAvoidingView>
          </View>
        </View>
        </View>
        </View>

        {/* 分类选择器 */}
        <Modal
          visible={showCategoryPicker}
          transparent={true}
          onRequestClose={() => setShowCategoryPicker(false)}
        >
          <View style={styles.pickerModalOverlay}>
            <TouchableOpacity
              style={styles.pickerModalBackdrop}
              activeOpacity={1}
              onPress={() => setShowCategoryPicker(false)}
            />
            <View style={[styles.pickerModalContent, { maxHeight: '60%' }]}>
              <View style={styles.pickerModalHeader}>
                <Text style={styles.pickerModalTitle}>选择分类</Text>
                <TouchableOpacity onPress={() => setShowCategoryPicker(false)}>
                  <Ionicons name="close" size={24} color="#475569" />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.pickerList}>
                {categories.map(category => (
                  <TouchableOpacity
                    key={category}
                    style={styles.selectorOption}
                    onPress={() => handleCategorySelect(category)}
                  >
                    <Text style={styles.selectorOptionText}>{category}</Text>
                    {modalFormData.category === category && (
                      <Ionicons name="checkmark" size={20} color="#3b82f6" />
                    )}
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={styles.selectorOption}
                  onPress={() => handleCategorySelect('add_new')}
                >
                  <Ionicons name="settings" size={20} color="#3b82f6" />
                  <Text style={[styles.selectorOptionText, { color: '#3b82f6' }]}>去设置页面添加</Text>
                </TouchableOpacity>
              </ScrollView>
                </View>
          </View>
        </Modal>

        {/* 位置选择器 */}
        <Modal
          visible={showLocationPicker}
          transparent={true}
          onRequestClose={() => setShowLocationPicker(false)}
        >
          <View style={styles.pickerModalOverlay}>
            <TouchableOpacity
              style={styles.pickerModalBackdrop}
              activeOpacity={1}
              onPress={() => setShowLocationPicker(false)}
            />
            <View style={[styles.pickerModalContent, { maxHeight: '60%' }]}>
              <View style={styles.pickerModalHeader}>
                <Text style={styles.pickerModalTitle}>选择存放位置</Text>
                <TouchableOpacity onPress={() => setShowLocationPicker(false)}>
                  <Ionicons name="close" size={24} color="#475569" />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.pickerList}>
                {locations.map(location => (
                  <TouchableOpacity
                    key={location}
                    style={styles.selectorOption}
                    onPress={() => handleLocationSelect(location)}
                  >
                    <Text style={styles.selectorOptionText}>{location}</Text>
                    {modalFormData.location === location && (
                      <Ionicons name="checkmark" size={20} color="#3b82f6" />
                    )}
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={styles.selectorOption}
                  onPress={() => handleLocationSelect('add_new')}
                >
                  <Ionicons name="settings" size={20} color="#3b82f6" />
                  <Text style={[styles.selectorOptionText, { color: '#3b82f6' }]}>去设置页面添加</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* 日期选择器 */}
        <Modal
          visible={showDatePicker}
          transparent={true}
          onRequestClose={() => setShowDatePicker(false)}
        >
          <View style={styles.pickerModalOverlay}>
            <TouchableOpacity
              style={styles.pickerModalBackdrop}
              activeOpacity={1}
              onPress={() => setShowDatePicker(false)}
            />
            <View style={[styles.pickerModalContent, { maxHeight: '70%' }]}>
              <View style={styles.pickerModalHeader}>
                <Text style={styles.pickerModalTitle}>选择过期日期</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Ionicons name="close" size={24} color="#475569" />
                </TouchableOpacity>
              </View>

              <View style={styles.datePickerContainer}>
                {/* 年份选择 */}
                <View style={styles.datePickerColumn}>
                  <Text style={styles.datePickerLabel}>年</Text>
                  <ScrollView style={styles.datePickerScroll} showsVerticalScrollIndicator={false}>
                    {generateYears().map(year => (
                      <TouchableOpacity
                        key={year}
                        style={[styles.datePickerOption, selectedYear === year && styles.datePickerOptionSelected]}
                        onPress={() => setSelectedYear(year)}
                      >
                        <Text style={[styles.datePickerOptionText, selectedYear === year && styles.datePickerOptionTextSelected]}>
                          {year}
            </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {/* 月份选择 */}
                <View style={styles.datePickerColumn}>
                  <Text style={styles.datePickerLabel}>月</Text>
                  <ScrollView style={styles.datePickerScroll} showsVerticalScrollIndicator={false}>
                    {generateMonths().map(month => (
              <TouchableOpacity
                        key={month}
                        style={[styles.datePickerOption, selectedMonth === month && styles.datePickerOptionSelected]}
                        onPress={() => setSelectedMonth(month)}
                      >
                        <Text style={[styles.datePickerOptionText, selectedMonth === month && styles.datePickerOptionTextSelected]}>
                          {month}
                        </Text>
              </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {/* 日期选择 */}
                <View style={styles.datePickerColumn}>
                  <Text style={styles.datePickerLabel}>日</Text>
                  <ScrollView style={styles.datePickerScroll} showsVerticalScrollIndicator={false}>
                    {generateDays().map(day => (
              <TouchableOpacity
                        key={day}
                        style={[styles.datePickerOption, selectedDay === day && styles.datePickerOptionSelected]}
                        onPress={() => setSelectedDay(day)}
                      >
                        <Text style={[styles.datePickerOptionText, selectedDay === day && styles.datePickerOptionTextSelected]}>
                          {day}
                        </Text>
              </TouchableOpacity>
                    ))}
                  </ScrollView>
            </View>
          </View>

              <TouchableOpacity
                style={styles.datePickerConfirmButton}
                onPress={handleDateConfirm}
              >
                <Text style={styles.datePickerConfirmButtonText}>确定</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </Modal>
    );
  });

  const SettingsPage = () => {
    const [newCatInput, setNewCatInput] = useState('');
    const [newLocInput, setNewLocInput] = useState('');

    return (
      <ScrollView style={styles.settingsPage} contentContainerStyle={styles.settingsContent}>
        <Text style={styles.settingsTitle}>设置</Text>

        <View style={styles.settingsSection}>
          <View style={styles.settingsCard}>
            <View style={styles.cardHeader}>
              <Ionicons name="pricetag-outline" size={18} color="#475569" />
              <Text style={styles.cardTitle}>管理分类</Text>
            </View>
            <View style={styles.tagsContainer}>
              {categories.map(c => (
                <View key={c} style={styles.tag}>
                  <Text style={styles.tagText}>{c}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert('确认删除', `删除分类"${c}"？`, [
                        { text: '取消', style: 'cancel' },
                        {
                          text: '删除',
                          style: 'destructive',
                          onPress: () => {
                            setCategories(categories.filter(x => x !== c));
                            saveData();
                          }
                        }
                      ]);
                    }}
                  >
                    <Ionicons name="close" size={12} color="#64748b" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
            <View style={styles.addTagRow}>
              <TextInput
                style={styles.addTagInput}
                placeholder="新增分类"
                placeholderTextColor="#94a3b8"
                value={newCatInput}
                onChangeText={setNewCatInput}
              />
              <TouchableOpacity
                onPress={() => {
                  if (newCatInput && !categories.includes(newCatInput)) {
                    setCategories([...categories, newCatInput]);
                    setNewCatInput('');
                    saveData();
                  }
                }}
                style={styles.addTagButton}
              >
                <Text style={styles.addTagButtonText}>添加</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.settingsCard}>
            <View style={styles.cardHeader}>
              <Ionicons name="location-outline" size={18} color="#475569" />
              <Text style={styles.cardTitle}>管理位置</Text>
            </View>
            <View style={styles.tagsContainer}>
              {locations.map(l => (
                <View key={l} style={styles.tag}>
                  <Text style={styles.tagText}>{l}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert('确认删除', `删除位置"${l}"？`, [
                        { text: '取消', style: 'cancel' },
                        {
                          text: '删除',
                          style: 'destructive',
                          onPress: () => {
                            setLocations(locations.filter(x => x !== l));
                            saveData();
                          }
                        }
                      ]);
                    }}
                  >
                    <Ionicons name="close" size={12} color="#64748b" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
            <View style={styles.addTagRow}>
              <TextInput
                style={styles.addTagInput}
                placeholder="新增位置"
                placeholderTextColor="#94a3b8"
                value={newLocInput}
                onChangeText={setNewLocInput}
              />
              <TouchableOpacity
                onPress={() => {
                  if (newLocInput && !locations.includes(newLocInput)) {
                    setLocations([...locations, newLocInput]);
                    setNewLocInput('');
                    saveData();
                  }
                }}
                style={styles.addTagButton}
              >
                <Text style={styles.addTagButtonText}>添加</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.settingsCard}>
            <View style={styles.cardHeader}>
              <Ionicons name="notifications-outline" size={18} color="#3b82f6" />
              <Text style={styles.cardTitle}>通知设置</Text>
            </View>
            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>过期提醒</Text>
              <TouchableOpacity
                style={[styles.switchContainer, !notificationsEnabled && styles.switchContainerDisabled]}
                onPress={async () => {
                  if (!notificationsEnabled) {
                    // 请求权限
                    const { status } = await Notifications.requestPermissionsAsync();
                    if (status === 'granted') {
                      setNotificationsEnabled(true);
                    } else {
                      Alert.alert('提示', '需要通知权限才能开启提醒功能');
                      return;
                    }
                  } else {
                    setNotificationsEnabled(false);
                  }
                }}
              >
                <View style={[styles.switchTrack, !notificationsEnabled && styles.switchTrackDisabled]}>
                  <View style={[styles.switchThumb, !notificationsEnabled && styles.switchThumbDisabled]} />
                </View>
                <Text style={[styles.switchText, !notificationsEnabled && styles.switchTextDisabled]}>
                  {notificationsEnabled ? '开启' : '关闭'}
                </Text>
              </TouchableOpacity>
            </View>
              <Text style={styles.hintText}>
                开启后将在物品到期前30、15、7天发送提醒通知
              </Text>
              <TouchableOpacity
                onPress={async () => {
                  try {
                    await Notifications.scheduleNotificationAsync({
                      content: {
                        title: '🔔 测试通知',
                        body: '这是一个测试通知，验证通知功能是否正常',
                        sound: 'default',
                        priority: Notifications.AndroidNotificationPriority.HIGH,
                      },
                      trigger: null,
                    });
                    Alert.alert('成功', '测试通知已发送，请检查是否收到');
                  } catch (error) {
                    Alert.alert('失败', `发送测试通知失败: ${error instanceof Error ? error.message : '未知错误'}`);
                  }
                }}
                style={styles.settingsButton}
              >
                <Ionicons name="notifications" size={16} color="#3b82f6" />
                <Text style={[styles.settingsButtonText, { color: '#3b82f6' }]}>
                  发送测试通知
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
              </TouchableOpacity>
          </View>

          <View style={styles.settingsCard}>
            <View style={styles.cardHeader}>
              <Ionicons name="archive-outline" size={18} color="#64748b" />
              <Text style={styles.cardTitle}>归档管理</Text>
            </View>
            <TouchableOpacity
              onPress={() => setActiveTab('archived')}
              style={styles.settingsButton}
            >
              <Ionicons name="archive" size={16} color="#64748b" />
              <Text style={styles.settingsButtonText}>
                查看归档记录 ({items.filter(item => item.archived).length})
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <View style={styles.dangerCard}>
            <Text style={styles.dangerTitle}>危险区域</Text>
            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  '警告',
                  '这将会清空所有囤货数据，且无法恢复！确认吗？',
                  [
                    { text: '取消', style: 'cancel' },
                    {
                      text: '确认',
                      style: 'destructive',
                      onPress: async () => {
                        await AsyncStorage.clear();
                        setItems([]);
                        setCategories(['食品', '日用品', '药品', '美妆', '清洁']);
                        setLocations(['冰箱', '储物柜', '浴室', '主卧', '玄关']);
                        // 不需要调用 saveData() 因为数据已经被清空
                      }
                    }
                  ]
                );
              }}
              style={styles.dangerButton}
            >
              <Text style={styles.dangerButtonText}>清除所有数据</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  };

  const ArchivedPage = () => {
    const archivedItems = items.filter(item => item.archived);

    return (
      <ScrollView style={styles.settingsPage} contentContainerStyle={styles.settingsContent}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <TouchableOpacity
              onPress={() => setActiveTab('settings')}
              style={styles.backButton}
            >
              <Ionicons name="chevron-back" size={24} color="#475569" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>归档记录</Text>
            <View style={{ width: 40 }} />
          </View>
        </View>

        {archivedItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="archive-outline" size={48} color="#cbd5e1" />
            <Text style={styles.emptyText}>暂无归档物品</Text>
          </View>
        ) : (
          archivedItems.map(item => (
            <View key={item.id} style={styles.archivedItemCard}>
              <View style={styles.itemImageContainer}>
                {item.image ? (
                  <Image source={{ uri: item.image }} style={styles.itemImage as any} />
                ) : (
                  <View style={styles.itemImagePlaceholder}>
                    <Ionicons name="camera-outline" size={24} color="#cbd5e1" />
                  </View>
                )}
              </View>

              <View style={styles.itemContent}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <View style={styles.archivedBadge}>
                    <Text style={styles.archivedBadgeText}>已归档</Text>
                  </View>
                </View>

                <View style={styles.itemInfo}>
                  <View style={styles.infoRow}>
                    <Ionicons name="pricetag-outline" size={14} color="#94a3b8" />
                    <Text style={styles.infoText}>{item.category || '未分类'}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons name="location-outline" size={14} color="#94a3b8" />
                    <Text style={styles.infoText}>{item.location || '未设置位置'}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons name="time-outline" size={14} color="#94a3b8" />
                    <Text style={styles.infoText}>
                      {item.archivedAt ? `归档于 ${new Date(item.archivedAt).toLocaleDateString()}` : '归档时间未知'}
                    </Text>
                  </View>
                </View>

                <View style={styles.archivedActions}>
                  <TouchableOpacity
                    onPress={() => handleRestoreItem(item.id)}
                    style={styles.restoreButton}
                  >
                    <Ionicons name="refresh" size={14} color="#16a34a" />
                    <Text style={styles.restoreButtonText}>恢复</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(item.id)}
                    style={styles.actionButton}
                  >
                    <Ionicons name="trash-outline" size={14} color="#ef4444" />
                    <Text style={[styles.actionText, { color: '#ef4444' }]}>删除</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    );
  };

  const FilterModal = ({
    visible,
    currentFilters,
    currentSortConfig,
    onSubmit,
    onClose
  }: {
    visible: boolean;
    currentFilters: FilterState;
    currentSortConfig: SortConfig;
    onSubmit: (filters: FilterState, sortConfig: SortConfig) => void;
    onClose: () => void;
  }) => {
    // 独立的本地状态，完全不依赖父组件
    const [localFilters, setLocalFilters] = useState<FilterState>(currentFilters);
    const [localSortConfig, setLocalSortConfig] = useState<SortConfig>(currentSortConfig);
    const initializedRef = React.useRef(false);

    // 初始化数据 - 只在Modal第一次打开时执行
    React.useEffect(() => {
      if (visible && !initializedRef.current) {
        setLocalFilters(currentFilters);
        setLocalSortConfig(currentSortConfig);
        initializedRef.current = true;
      } else if (!visible) {
        // Modal关闭时重置初始化标志，为下次打开做准备
        initializedRef.current = false;
      }
    }, [visible, currentFilters, currentSortConfig]);

    const handleReset = React.useCallback(() => {
      setLocalFilters({
        search: '',
        category: 'all',
        location: 'all',
        status: 'all'
      });
      setLocalSortConfig({
        key: 'expiryDate',
        direction: 'asc'
      });
    }, []);

    const handleConfirm = React.useCallback(() => {
      onSubmit(localFilters, localSortConfig);
      onClose();
    }, [localFilters, localSortConfig, onSubmit, onClose]);

    return (
      <Modal
        visible={visible}
        transparent={true}
        onRequestClose={onClose}
        key={`filter-modal-${visible}`}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={onClose}
          />
          <View style={styles.filterModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>筛选与排序</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.filterContent}>
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>排序方式</Text>
                <View style={styles.sortButtons}>
                  {[
                    { k: 'expiryDate', l: '过期时间' },
                    { k: 'quantity', l: '数量' },
                    { k: 'createdAt', l: '创建时间' }
                  ].map(opt => (
                    <TouchableOpacity
                      key={opt.k}
                      onPress={() => setLocalSortConfig({ ...localSortConfig, key: opt.k as keyof Item })}
                      style={[
                        styles.sortButton,
                        localSortConfig.key === opt.k && styles.sortButtonActive
                      ]}
                    >
                      <Text
                        style={[
                          styles.sortButtonText,
                          localSortConfig.key === opt.k && styles.sortButtonTextActive
                        ]}
                      >
                        {opt.l}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>按分类</Text>
                <View style={styles.pickerContainer}>
                  {['all', ...categories].map(c => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setLocalFilters({ ...localFilters, category: c })}
                      style={[
                        styles.pickerOption,
                        localFilters.category === c && styles.pickerOptionActive
                      ]}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          localFilters.category === c && styles.pickerOptionTextActive
                        ]}
                      >
                        {c === 'all' ? '全部分类' : c}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>按位置</Text>
                <View style={styles.pickerContainer}>
                  {['all', ...locations].map(l => (
                    <TouchableOpacity
                      key={l}
                      onPress={() => setLocalFilters({ ...localFilters, location: l })}
                      style={[
                        styles.pickerOption,
                        localFilters.location === l && styles.pickerOptionActive
                      ]}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          localFilters.location === l && styles.pickerOptionTextActive
                        ]}
                      >
                        {l === 'all' ? '全部位置' : l}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>按状态</Text>
                <View style={styles.statusFilterButtons}>
                  {[
                    { k: 'all', l: '全部' },
                    { k: 'expiring', l: '临期(30天内)' },
                    { k: 'expired', l: '已过期' }
                  ].map(opt => (
                    <TouchableOpacity
                      key={opt.k}
                      onPress={() => setLocalFilters({ ...localFilters, status: opt.k as any })}
                      style={[
                        styles.statusFilterButton,
                        localFilters.status === opt.k && styles.statusFilterButtonActive
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusFilterButtonText,
                          localFilters.status === opt.k && styles.statusFilterButtonTextActive
                        ]}
                      >
                        {opt.l}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            <View style={styles.filterButtonsContainer}>
            <TouchableOpacity
                onPress={handleReset}
                style={styles.filterResetButton}
              >
                <Ionicons name="refresh" size={20} color="#64748b" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirm}
                style={[styles.filterConfirmButton, { flex: 1 }]}
            >
              <Text style={styles.filterConfirmButtonText}>
                查看结果 ({processedItems.length})
              </Text>
            </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  // 在 Web 平台上使用 View，移动端使用 SafeAreaView
  const Container = Platform.OS === 'web' ? View : SafeAreaView;
  
  return (
    <SafeAreaProvider>
      <Container style={styles.container}>
        {Platform.OS !== 'web' && <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />}
        {activeTab === 'home' && (
          <View style={styles.homeTab}>
            <Header />
            <ItemList />
          </View>
        )}

        {activeTab === 'settings' && <SettingsPage />}
        {activeTab === 'archived' && <ArchivedPage />}

        <View style={styles.bottomNav}>
        <TouchableOpacity
          onPress={() => {
            setActiveTab('home');
            setEditingItem(null);
          }}
          style={styles.navButton}
        >
          <Ionicons
            name={activeTab === 'home' ? 'home' : 'home-outline'}
            size={24}
            color={activeTab === 'home' ? '#3b82f6' : '#94a3b8'}
          />
          <Text
            style={[
              styles.navButtonText,
              { color: activeTab === 'home' ? '#3b82f6' : '#94a3b8' }
            ]}
          >
            列表
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            setEditingItem(null);
            setShowAddModal(true);
          }}
          style={styles.addButton}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('settings')}
          style={styles.navButton}
        >
          <Ionicons
            name={activeTab === 'settings' ? 'settings' : 'settings-outline'}
            size={24}
            color={activeTab === 'settings' ? '#3b82f6' : '#94a3b8'}
          />
          <Text
            style={[
              styles.navButtonText,
              { color: activeTab === 'settings' ? '#3b82f6' : '#94a3b8' }
            ]}
          >
            管理
          </Text>
        </TouchableOpacity>
      </View>

        <FilterModal
          visible={showFilterModal}
          currentFilters={filters}
          currentSortConfig={sortConfig}
          onSubmit={handleFilterSubmit}
          onClose={() => setShowFilterModal(false)}
        />
        <AddEditModal
          visible={showAddModal}
          editingItem={editingItem}
          onSubmit={handleModalSubmit}
          onClose={closeAddModal}
        />
      </Container>
    </SafeAreaProvider>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    ...(Platform.OS === 'web' ? { minHeight: '100vh' as any, width: '100%' } : {}),
  },
  homeTab: {
    flex: 1
  },
  header: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0'
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b'
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8
  },
  iconButton: {
    padding: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 20
  },
  iconButtonActive: {
    backgroundColor: '#dbeafe'
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12
  },
  searchIcon: {
    marginRight: 8
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1e293b'
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 8
  },
  statBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8
  },
  statText: {
    fontSize: 12,
    fontWeight: '500'
  },
  itemList: {
    flex: 1
  },
  itemListContent: {
    padding: 16,
    paddingBottom: 100
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#94a3b8'
  },
  itemCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2
  },
  itemImageContainer: {
    width: 120,
    height: 120,
    backgroundColor: '#f1f5f9',
    position: 'relative'
  },
  itemImage: {
    width: '100%',
    height: '100%'
  },
  itemImagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center'
  },
  statusBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold'
  },
  itemContent: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between'
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8
  },
  itemName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    flex: 1
  },
  quantityBadge: {
    backgroundColor: '#f8fafc',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  quantityText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#475569'
  },
  itemInfo: {
    gap: 6
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  infoText: {
    fontSize: 14,
    color: '#64748b'
  },
  itemActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9'
  },
  quantityControls: {
    flexDirection: 'row',
    gap: 8
  },
  quantityButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center'
  },
  quantityButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b'
  },
  backButton: {
    padding: 8
  },
  archivedItemCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    opacity: 0.8
  },
  archivedBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12
  },
  archivedBadgeText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500'
  },
  archivedActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 12
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bbf7d0'
  },
  restoreButtonText: {
    color: '#16a34a',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 4
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    gap: 12
  },
  settingsButtonText: {
    flex: 1,
    fontSize: 16,
    color: '#475569'
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12
  },
  settingLabel: {
    fontSize: 16,
    color: '#475569'
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  switchContainerDisabled: {
    opacity: 0.6
  },
  switchTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    paddingHorizontal: 2
  },
  switchTrackDisabled: {
    backgroundColor: '#e2e8f0'
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    transform: [{ translateX: 20 }]
  },
  switchThumbDisabled: {
    transform: [{ translateX: 0 }]
  },
  switchText: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '500'
  },
  switchTextDisabled: {
    color: '#94a3b8'
  },
  hintText: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
    lineHeight: 16
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  actionText: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '500'
  },
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingVertical: 12,
    paddingBottom: 24
  },
  navButton: {
    alignItems: 'center',
    gap: 4,
    flex: 1
  },
  navButtonText: {
    fontSize: 12,
    fontWeight: '500'
  },
  addButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -28,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent'
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end'
  },
  modalContentTouchable: {
    flex: 1,
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: MODAL_HEIGHT,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 16
  },
  keyboardAvoidingContainer: {
    flex: 1,
    height: '100%'
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0'
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b'
  },
  closeButton: {
    padding: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 20
  },
  form: {
    flex: 1
  },
  formContent: {
    padding: 24,
    paddingBottom: 80
  },
  imageUploadArea: {
    width: 160,
    height: 160,
    alignSelf: 'center',
    borderWidth: 2,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
    borderRadius: 16,
    marginBottom: 20,
    overflow: 'hidden'
  },
  imagePreview: {
    width: '100%',
    height: '100%'
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc'
  },
  imagePlaceholderText: {
    marginTop: 8,
    fontSize: 14,
    color: '#64748b'
  },
  formGroup: {
    marginBottom: 20
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
    marginBottom: 8,
    marginLeft: 4
  },
  input: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1e293b'
  },
  centeredInput: {
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 18
  },
  row: {
    flexDirection: 'row'
  },
  inputWithIcon: {
    position: 'relative'
  },
  inputIcon: {
    position: 'absolute',
    right: 16,
    top: '50%',
    transform: [{ translateY: -9 }]
  },
  submitButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold'
  },
  settingsPage: {
    flex: 1
  },
  settingsContent: {
    padding: 16,
    paddingBottom: 100
  },
  settingsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 24
  },
  settingsSection: {
    gap: 24
  },
  settingsCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#475569'
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16
  },
  tagText: {
    fontSize: 14,
    color: '#475569'
  },
  addTagRow: {
    flexDirection: 'row',
    gap: 8
  },
  addTagInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1e293b'
  },
  addTagButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8
  },
  addTagButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500'
    
  },
  dangerCard: {
    backgroundColor: '#fef2f2',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca'
  },
  dangerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#991b1b',
    marginBottom: 12
  },
  dangerButton: {
    backgroundColor: '#dc2626',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center'
  },
  dangerButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500'
  },
  filterModalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24
  },
  filterContent: {
    maxHeight: 400
  },
  filterSection: {
    marginBottom: 24
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
    marginBottom: 12
  },
  sortButtons: {
    flexDirection: 'row',
    gap: 8
  },
  sortButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center'
  },
  sortButtonActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#3b82f6'
  },
  sortButtonText: {
    fontSize: 14,
    color: '#475569'
  },
  sortButtonTextActive: {
    color: '#1e40af',
    fontWeight: '500'
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 16
  },
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-start'
  },
  pickerOption: {
    flex: 1,
    minWidth: '30%',
    maxWidth: '30%',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center'
  },
  pickerOptionActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#3b82f6'
  },
  pickerOptionText: {
    fontSize: 14,
    color: '#475569'
  },
  pickerOptionTextActive: {
    color: '#1e40af',
    fontWeight: '500'
  },
  statusFilterButtons: {
    flexDirection: 'row',
    gap: 8
  },
  statusFilterButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center'
  },
  statusFilterButtonActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#3b82f6'
  },
  statusFilterButtonText: {
    fontSize: 12,
    color: '#475569'
  },
  statusFilterButtonTextActive: {
    color: '#1e40af',
    fontWeight: '500'
  },
  filterConfirmButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center'
  },
  filterConfirmButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold'
  },
  filterButtonsContainer: {
    flexDirection: 'row',
    marginTop: 24,
    alignItems: 'center'
  },
  filterResetButtonContainer: {
    justifyContent: 'center',
    alignItems: 'center'
  },
  filterResetButton: {
    width: 48,
    height: 48,
    backgroundColor: '#f1f5f9',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignSelf: 'center',
    marginRight: 12
  },

  // 选择器相关样式
  pickerButton: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  pickerButtonText: {
    fontSize: 16,
    color: '#1e293b',
    flex: 1
  },
  pickerButtonPlaceholder: {
    color: '#94a3b8'
  },
  pickerModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent'
  },
  pickerModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent'
  },
  pickerModalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '60%',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 16
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0'
  },
  pickerModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b'
  },
  pickerList: {
    maxHeight: 300
  },
  selectorOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  selectorOptionText: {
    fontSize: 16,
    color: '#475569'
  },

  // 日期选择器样式
  datePickerContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8
  },
  datePickerColumn: {
    flex: 1,
    alignItems: 'center'
  },
  datePickerLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
    marginBottom: 8
  },
  datePickerScroll: {
    height: 200,
    width: '100%'
  },
  datePickerOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 2,
    borderRadius: 8,
    alignItems: 'center'
  },
  datePickerOptionSelected: {
    backgroundColor: '#dbeafe'
  },
  datePickerOptionText: {
    fontSize: 16,
    color: '#475569'
  },
  datePickerOptionTextSelected: {
    color: '#1e40af',
    fontWeight: '600'
  },
  datePickerConfirmButton: {
    backgroundColor: '#3b82f6',
    margin: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center'
  },
  datePickerConfirmButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600'
  }
});