import React, { useState, useRef, useEffect } from 'react';
import { View, Button, Vibration } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Gyroscope, Accelerometer } from 'expo-sensors';
import JSZip from 'jszip';

export default function App() {
    const [recording, setRecording] = useState(null);
    const [gyroscopeData, setGyroscopeData] = useState([]);
    const [accelerometerData, setAccelerometerData] = useState([]);
    const [isSessionActive, setIsSessionActive] = useState(false);
    const [timestamps, setTimestamps] = useState({});
    const gyroSubscription = useRef(null);
    const accelSubscription = useRef(null);
    const delayBeforeVibration = 2000 // milliseconds
    const delayBeforeAudio = 3000 // milliseconds

    useEffect(() => {
        Gyroscope.isAvailableAsync().then(available => {
            if (!available) console.warn('Гироскоп недоступен');
        });

        Accelerometer.isAvailableAsync().then(available => {
            if (!available) console.warn('Акселерометр недоступен');
        });
    }, []);

    async function setupAudio() {
        try {
            await Audio.requestPermissionsAsync();
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });
        } catch (error) {
            console.error('Ошибка настройки аудиорежима:', error);
        }
    }

    async function startSession() {
        try {
            await setupAudio();
            setIsSessionActive(true);
            const memsStartTime = new Date().toISOString();
            setTimestamps(prev => ({ ...prev, memsStartTime }));

            // Запуск записи MEMS
            gyroSubscription.current = Gyroscope.addListener(data => {
                setGyroscopeData(prev => [...prev, { timestamp2: new Date().toISOString(), ...data }]);
            });
            accelSubscription.current = Accelerometer.addListener(data => {
                setAccelerometerData(prev => [...prev, { timestamp2: new Date().toISOString(), ...data }]);
            });

            setTimeout(() => {
                const vibrationTime = new Date().toISOString();
                setTimestamps(prev => ({ ...prev, vibrationTime }));
                Vibration.vibrate([300, 300, 300, 300, 300, 300]);

                setTimeout(async () => {
                    try {
                         
                        const audio = new Audio.Recording();
                        await audio.prepareToRecordAsync(Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY);
                        const audioStartTime = new Date().toISOString();
                        setTimestamps(prev => ({ ...prev, audioStartTime}));
                        await audio.startAsync();
                        const audioStartCommandEnd = new Date().toISOString();
                        setTimestamps(prev => ({ ...prev, audioStartCommandEnd }));
                        setRecording(audio);
                    } catch (error) {
                        console.error('Ошибка при запуске аудиозаписи:', error);
                    }
                }, delayBeforeAudio);
            }, delayBeforeVibration);
        } catch (error) {
            console.error('Ошибка при старте сессии:', error);
        }
    }

    async function stopAndShare() {
        try {
            if (!recording) return;
    
            await recording.stopAndUnloadAsync();
            const uri = recording.getURI();
    
            // Остановка MEMS
            gyroSubscription.current && gyroSubscription.current.remove();
            accelSubscription.current && accelSubscription.current.remove();
    
            // Формируем CSV-данные
            const csvHeader = "timestamp,gyro_x,gyro_y,gyro_z,accel_x,accel_y,accel_z\n";
            const csvRows = gyroscopeData.map((gyro, i) => {
                const accel = accelerometerData[i] || {};
                return `${gyro.timestamp2},${gyro.x || 0},${gyro.y || 0},${gyro.z || 0},${accel.x || 0},${accel.y || 0},${accel.z || 0}`;
            }).join("\n");
    
            const csvData = csvHeader + csvRows;
            const csvPath = `${FileSystem.documentDirectory}mems.csv`;
            await FileSystem.writeAsStringAsync(csvPath, csvData);
    
            // Создание info.json
            const infoData = JSON.stringify({
                delayBeforeVibration: delayBeforeVibration,
                delayBeforeAudio: delayBeforeAudio,
                ...timestamps
            }, null, 2);
            const infoPath = `${FileSystem.documentDirectory}info.json`;
            await FileSystem.writeAsStringAsync(infoPath, infoData);
    
            // Создание архива
            const zip = new JSZip();
            zip.file('audio.m4a', await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 }), { base64: true });
            zip.file('mems.csv', csvData);
            zip.file('info.json', infoData);
    
            const zipBlob = await zip.generateAsync({ type: 'base64' });
            const zipPath = `${FileSystem.documentDirectory}session.zip`;
            await FileSystem.writeAsStringAsync(zipPath, zipBlob, { encoding: FileSystem.EncodingType.Base64 });
    
            // Отправка архива
            await Sharing.shareAsync(zipPath);
    
            // Очистка состояния
            setRecording(null);
            setGyroscopeData([]);
            setAccelerometerData([]);
            setIsSessionActive(false);
            setTimestamps({});
        } catch (error) {
            console.error('Ошибка при остановке и отправке:', error);
        }
    }

    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Button title="Start Session" onPress={startSession} disabled={isSessionActive} />
            <Button title="Stop & Share" onPress={stopAndShare} disabled={!isSessionActive} />
        </View>
    );
}
