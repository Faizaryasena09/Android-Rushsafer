import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api";
import Cookies from "js-cookie";
import { ImSpinner2 } from 'react-icons/im';
import JoditEditor from "jodit-react";
import debounce from 'lodash.debounce';

import { FiFlag, FiClock, FiChevronLeft, FiChevronRight, FiCheckCircle, FiAlertTriangle } from 'react-icons/fi';

function DoExamPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const waktuRef = useRef(0);

  const userId = Cookies.get("user_id");

  const [examTitle, setExamTitle] = useState("Memuat Ujian...");
  const [soalList, setSoalList] = useState([]);
  const [showResult, setShowResult] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [jawabanSiswa, setJawabanSiswa] = useState({});
  const [raguRagu, setRaguRagu] = useState({});
  const [showStartModal, setShowStartModal] = useState(true);
  const [showSelesaiModal, setShowSelesaiModal] = useState(false);
  const [waktuSisa, setWaktuSisa] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const { id: courseId } = useParams();
  const [authChecked, setAuthChecked] = useState(false);
  const [sudahInputToken, setSudahInputToken] = useState(true);
  const [attemptNow, setAttemptNow] = useState(1);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [maxInfo, setMaxInfo] = useState(null);
  const [acakSoal, setAcakSoal] = useState(false);
  const [acakJawaban, setAcakJawaban] = useState(false);
  const [minWaktuSubmit, setMinWaktuSubmit] = useState(0);
  const [configWaktu, setConfigWaktu] = useState(30);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [submitCountdown, setSubmitCountdown] = useState(null);
  const [totalWaktu, setTotalWaktu] = useState(0);
  const [showSidebar, setShowSidebar] = useState(false);
  const [courseTitle, setCourseTitle] = useState("");
  const [pgQuestions, setPgQuestions] = useState([]);
  const [essayQuestions, setEssayQuestions] = useState([]);
  const [isLoadingAccess, setIsLoadingAccess] = useState(true);
  const [isAccessAllowed, setIsAccessAllowed] = useState(false);

  useEffect(() => {
    const verifyAccess = async () => {
      try {
        const courseRes = await api.get(`/courses/${id}`);
        const needsSecureApp = courseRes.data.use_secure_app;

        if (needsSecureApp) {
          const isSecure = navigator.userAgent.includes('ExamBrowser/');
          if (isSecure) {
            setIsAccessAllowed(true);
          } else {
            setIsAccessAllowed(false);
          }
        } else {
          setIsAccessAllowed(true);
        }
      } catch (error) {
        console.error("Gagal memverifikasi akses course:", error);
        setIsAccessAllowed(false);
      } finally {
        setIsLoadingAccess(false);
      }
    };

    verifyAccess();
  }, [id]);
  
  const currentSoal = soalList[currentIndex];
  
  const opsiArray = currentSoal && currentSoal.tipe_soal === 'pilihan_ganda' ? (
    typeof currentSoal.opsi === "string" 
    ? JSON.parse(currentSoal.opsi) 
    : currentSoal.opsi || []
  ) : [];

  useEffect(() => {
    const checkTokenRequirement = async () => {
      try {
        const courseRes = await api.get(`/courses/${courseId}`);
        const useToken = courseRes.data.useToken;
        const title = courseRes.data.title || "Tanpa Judul";
    
        setCourseTitle(title);
    
        if (!useToken) {
          setSudahInputToken(true);
          setAuthChecked(true);
          return;
        }
    
        const tokenRes = await api.get(`/courses/${courseId}/tokenAuth?user=${userId}`);
        if (tokenRes.data.isAuthorized) {
          setSudahInputToken(true);
        } else {
          setSudahInputToken(false);
        }
      } catch (err) {
        console.error("❌ Gagal cek useToken atau tokenAuth:", err.message);
        setSudahInputToken(false);
      } finally {
        setAuthChecked(true);
      }
    };    
  
    checkTokenRequirement();
  }, [courseId, userId]);  

  useEffect(() => {
    const userName = Cookies.get('user_id');
  
    if (!userName) {
      navigate('/login');
      return;
    }
  
    const checkAttempt = async () => {
      try {
        const res = await api.get(`/courses/${courseId}/status?user=${userName}`);
        const { sudahMaksimal, maxPercobaan, currentAttempt, useToken } = res.data;
  
        setMaxInfo({ max: maxPercobaan, current: currentAttempt });
  
        if (sudahMaksimal) {
          setBlocked(true);
        } else {
          setBlocked(false);
        }
      } catch (err) {
        console.error('❌ Gagal cek attempt:', err);
        navigate('/courses');
      } finally {
        setLoading(false);
      }
    };
  
    checkAttempt();
  }, [courseId, navigate]);  

  useEffect(() => {
    if (!showStartModal) {
      fetchSoal();
      fetchJawabanSiswa();
    }
  }, [showStartModal]);

  useEffect(() => {
    const cekWaktuUjian = async () => {
      if (!userId || !courseId) {
        console.warn("⛔ userId atau courseId belum tersedia. Abort cekWaktuUjian.");
        return;
      }
  
      try {
        const now = new Date();
  
        const res = await api.get(`/courses/${id}`);
        const mulai = new Date(res.data.tanggal_mulai);
        const selesai = res.data.tanggal_selesai ? new Date(res.data.tanggal_selesai) : null;
  
        if (now < mulai) {
          alert("Ujian belum dimulai. Silakan kembali nanti.");
          navigate("/courses");
          return;
        }
  
        if (selesai && now > selesai) {
          alert("Ujian telah berakhir.");
          navigate("/courses");
          return;
        }
  
        let waktuDetik = null;
  
        try {
          const waktuRes = await api.get(`/answertrail/timer-get`, {
            params: {
              user_id: userId,
              course_id: courseId
            }
          });
  
          waktuDetik = waktuRes.data.waktu_tersisa;
        } catch (err) {
          console.warn("❗ Timer belum tersedia, pakai waktu default:", err.message);
        }
  
        if (waktuDetik == null) {
          waktuDetik = (res.data.waktu == null ? 0 : res.data.waktu * 60);
        }        
  
        setWaktuSisa(waktuDetik);
      } catch (err) {
        console.error("❌ Gagal cek waktu ujian:", err);
      }
    };
  
    if (!showStartModal) {
      cekWaktuUjian();
    }
  }, [showStartModal, courseId, userId, id, navigate, attemptNow]);

  useEffect(() => {
    if (!minWaktuSubmit || minWaktuSubmit <= 0) return;
  
    const interval = setInterval(() => {
      const secondsLeft = waktuSisa - minWaktuSubmit * 60;
      if (secondsLeft > 0) {
        setSubmitCountdown(secondsLeft);
      } else {
        setSubmitCountdown(0);
        clearInterval(interval);
      }
    }, 1000);
  
    return () => clearInterval(interval);
  }, [waktuSisa, minWaktuSubmit]);

  const formatMenitDetik = (totalDetik) => {
    const menit = Math.floor(totalDetik / 60);
    const detik = totalDetik % 60;
    return `${menit.toString().padStart(2, "0")}:${detik.toString().padStart(2, "0")}`;
  };  

  useEffect(() => {
    const fetchAttempt = async () => {
      try {
        const res = await api.get(`/jawaban/last-attempt`, {
          params: { user_id: userId, course_id: courseId },
        });
        setAttemptNow((res.data.lastAttempt || 0) + 1);
      } catch (err) {
        console.error("❌ Gagal ambil attempt:", err.message);
      }
    };
  
    fetchAttempt();
  }, [userId, courseId]);  

  useEffect(() => {
    if (showStartModal || soalList.length === 0 || waktuSisa <= 0) return;
  
    const timer = setInterval(() => {
      waktuRef.current -= 1;
      if (waktuRef.current <= 0) {
        clearInterval(timer);
        handleSelesaiUjian();
      } else {
        setWaktuSisa(waktuRef.current);
      }
    }, 1000);
  
    return () => clearInterval(timer);
  }, [showStartModal, soalList.length]);  

  useEffect(() => {
    const sse = new EventSource(`${api.defaults.baseURL}/exam/session/stream`);

    sse.addEventListener('unlock', (e) => {
      const data = JSON.parse(e.data);
      const currentUserId = Cookies.get("user_id");

      if (data.user_id && data.user_id.toString() === currentUserId) {
        console.log("SSE 'unlock' received for current user. Closing app.");
        if (window.chrome && window.chrome.webview) {
          window.chrome.webview.postMessage({ type: 'unlock' });
        } else if (window.Android) {
          window.Android.postMessage(JSON.stringify({ type: 'unlock' }));
        }
      }
    });

    return () => {
      sse.close();
    };
  }, []);

  useEffect(() => {
    if (showStartModal) return;

    const updateUserSessionStatus = async () => {
      try {
        const currentUserId = Cookies.get("user_id");
        if (currentUserId) {
          await api.post("/session", {
            user_id: currentUserId,
            status: "online",
          });
        }
      } catch (error) {
        console.error("Failed to update session status:", error);
      }
    };

    updateUserSessionStatus();
    const intervalId = setInterval(updateUserSessionStatus, 15000);

    return () => {
      clearInterval(intervalId);
    };
  }, [showStartModal]);

  const shuffleArray = (array) => {
    return array
      .map((a) => ({ sort: Math.random(), value: a }))
      .sort((a, b) => a.sort - b.sort)
      .map((a) => a.value);
  };

  useEffect(() => {
    waktuRef.current = waktuSisa;
  }, [waktuSisa]);  

const bersihkanOpsi = (opsi) => {
  return opsi
    .replace(/^\s*(<span[^>]*>)?\s*[A-Ea-e]\.\s*(<\/span>)?/i, "")
    .replace(/^\s*<(ol|ul)>\s*<li>/i, "")
    .replace(/<\/li>\s*<\/(ol|ul)>$/i, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
};
  
  const editorConfig = useMemo(() => ({
    readonly: false,
    height: 300,
    placeholder: 'Ketik jawaban esai Anda di sini...',
  }), []);

  const debouncedSave = useCallback(
    debounce((soalId, jawaban) => {
      simpanJawabanKeServer(soalId, jawaban);
    }, 1000),
    [userId, id, attemptNow] 
  );

  const handleEssayChange = useCallback((soalId, newContent) => {
    setJawabanSiswa((prev) => ({ ...prev, [soalId]: newContent }));
    debouncedSave(soalId, newContent);
  }, [debouncedSave]);
  
  const onEditorChange = useCallback((newContent) => {
    if (currentSoal?.id) {
      handleEssayChange(currentSoal.id, newContent);
    }
  }, [currentSoal?.id, handleEssayChange]);

  const fetchSoal = async () => {
    setIsLoading(true);
    try {
      const saved = localStorage.getItem(`timer-${userId}-${id}`);
      if (saved && !isNaN(saved)) {
        setWaktuSisa(parseInt(saved));
        waktuRef.current = parseInt(saved);
      }
  
      const config = await api.get(`/courses/${id}`);
      setExamTitle(config.data.title || "Ujian Kompetensi");
  
      const waktuDefault = (config.data.waktu == null ? 0 : config.data.waktu * 60);
      setTotalWaktu(waktuDefault);
      setMinWaktuSubmit(config.data.minWaktuSubmit || 0);
      setConfigWaktu(config.data.waktu || 30);
  
      let waktuAktif = waktuDefault;
  
      try {
        const timerRes = await api.get(`/answertrail/timer-get`, {
          params: { user_id: userId, course_id: id }
        });
  
        const waktuDB = timerRes.data?.waktu_tersisa;
  
        if (waktuDB !== null && !isNaN(parseInt(waktuDB))) {
          waktuAktif = parseInt(waktuDB);
        } else {
          await api.post(`/answertrail/timer-save`, {
            user_id: userId,
            course_id: id,
            waktu_tersisa: waktuAktif,
          });
        }
      } catch (err) {
        console.warn("❗ Timer belum tersedia, pakai waktu default:", err.message);
      }
  
      setWaktuSisa(waktuAktif);
  
      const acakSoalFromServer = config.data.acakSoal;
      const acakJawabanFromServer = config.data.acakJawaban;
      setAcakSoal(acakSoalFromServer);
      setAcakJawaban(acakJawabanFromServer);
  
      const soalRes = await api.get(`/courses/${id}/questions`);
      const rawSoal = soalRes.data;

      const pg = rawSoal.filter(s => s.tipe_soal === 'pilihan_ganda');
      const essay = rawSoal.filter(s => s.tipe_soal === 'esai');

      const pgFinal = (acakSoalFromServer ? shuffleArray(pg) : pg).map((soal, index) => {
        if (soal.tipe_soal === 'pilihan_ganda') {
          const opsiOriginal = typeof soal.opsi === "string" ? JSON.parse(soal.opsi) : soal.opsi;
          const opsiFinal = acakJawabanFromServer ? shuffleArray([...opsiOriginal]) : [...opsiOriginal];
    
          const opsiCleaned = opsiFinal.map((opsiHTML) => {
            try {
              const parser = new DOMParser();
              const doc = parser.parseFromString(opsiHTML, "text/html");
              const firstNode = doc.body.firstChild;
    
              if (
                firstNode &&
                firstNode.nodeType === 1 &&
                firstNode.childNodes.length === 1 &&
                firstNode.firstChild.nodeType === 3
              ) {
                const rawText = firstNode.textContent;
                if (/^[A-Da-d]\.\s*/.test(rawText)) {
                  firstNode.textContent = rawText.replace(/^[A-Da-d]\.\s*/, '');
                  return firstNode.outerHTML;
                }
              }
    
              return opsiHTML;
            } catch {
              return opsiHTML;
            }
          });
    
          const opsiMapping = opsiFinal.map((opsi) => {
            const idxAsli = opsiOriginal.findIndex(o => o === opsi);
            return String.fromCharCode(65 + idxAsli);
          });
    
          return {
            ...soal,
            opsi: opsiCleaned,
            opsiMapping,
          };
        }
        return soal;
      });

      const essayFinal = acakSoalFromServer ? shuffleArray(essay) : essay;

      setPgQuestions(pgFinal);
      setEssayQuestions(essayFinal);
      setSoalList([...pgFinal, ...essayFinal]);

    } catch (err) {
      console.error("❌ Gagal ambil soal:", err);
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentIndex]);  
  
  useEffect(() => {
    if (userId && courseId && waktuSisa > 0) {
      localStorage.setItem(`timer-${userId}-${courseId}`, waktuSisa.toString());
    }
  }, [waktuSisa, userId, courseId]);  

  const fetchJawabanSiswa = async () => {
    try {
      const res = await api.get(`/answertrail/${id}`, {
        params: {
          user_id: userId,
          attemp: attemptNow,
        },
      });
  
      const hasil = {};
      let sisaWaktuFromDB = null;
  
      res.data.forEach(item => {
        hasil[item.question_id] = item.answer;
        if (item.waktu_tersisa !== null) {
          sisaWaktuFromDB = item.waktu_tersisa;
        }
      });
  
      setJawabanSiswa(hasil);
    } catch (err) {
      console.error("Gagal ambil jawaban sebelumnya:", err);
    }
  };  

  const simpanJawabanKeServer = async (soalId, jawaban) => {
    try {
      await api.post("/answertrail", {
        user_id: userId,
        course_id: id,
        soal_id: soalId,
        jawaban,
        attemp: attemptNow,
      });
  
      const waktu = totalWaktu - waktuSisa;
  
      await api.post("/studentworklog", {
        user_id: userId,
        course_id: id,
        soal_id: soalId,
        jawaban,
        attemp: attemptNow,
        waktu,
      });
    } catch (err) {
      console.error("❌ Gagal simpan jawaban/log:", err.response?.data || err.message || err);
    }
  };
  const currentIndexRef = useRef(currentIndex);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  const soalListRef = useRef(soalList);
  useEffect(() => {
    soalListRef.current = soalList;
  }, [soalList]);

  const getSoalIdAktif = () => {
    const list = soalListRef.current;
    const index = currentIndexRef.current;
    if (Array.isArray(list) && list.length > 0 && index >= 0 && index < list.length) {
      return list[index]?.id || null;
    }
    return null;
  };

useEffect(() => {
  if (showStartModal) return;

  const logCopyPaste = async (jenis) => {
    try {
      const soalId = getSoalIdAktif();
      if (!soalId) {
        console.warn(`⚠️ Tidak ada soal aktif saat ${jenis}`);
        return;
      }

      const waktu = totalWaktu - waktuSisa;
      await api.post("/studentworklog", {
        user_id: userId,
        course_id: courseId,
        soal_id: soalId,
        jawaban: jenis,
        attemp: attemptNow,
        waktu,
      });

      console.log(`✅ ${jenis} dicatat untuk soal_id: ${soalId}`);
    } catch (err) {
      console.error(`❌ Gagal catat ${jenis}:`, err.message);
    }
  };

  const handleCopy = () => logCopyPaste("[COPY DETECTED]");
  const handlePaste = () => logCopyPaste("[PASTE DETECTED]");

  document.addEventListener("copy", handleCopy);
  document.addEventListener("paste", handlePaste);

  return () => {
    document.removeEventListener("copy", handleCopy);
    document.removeEventListener("paste", handlePaste);
  };
}, [
  showStartModal,
  totalWaktu,
  waktuSisa,
  userId,
  courseId,
  attemptNow
]);

  const submitJawabanUjian = async () => {
    try {
      const user_id = Cookies.get("user_id");
  
      const dataJawaban = Object.entries(jawabanSiswa).map(([soal_id, jawaban]) => ({
        soal_id: parseInt(soal_id),
        jawaban
      }));
  
      const timerKey = `timer-${userId}-${courseId}`;
      const timerData = localStorage.getItem(timerKey);
      let waktu_tersisa = null;
  
      if (timerData && !isNaN(timerData)) {
        waktu_tersisa = parseInt(timerData, 10);
      } else {
        console.warn("⚠️ Timer tidak ditemukan atau tidak valid");
      }
  
      await api.delete(`/answertrail/${id}`, {
        params: { user_id }
      });
  
      const res = await api.post(`/courses/${id}/submit`, {
        user_id,
        jawaban: dataJawaban,
        waktu_tersisa
      });
  
      const attemptId = res.data?.attempt;
      if (attemptId != null) {
        return attemptId;
      } else {
        console.warn("❗ Attempt tidak dikembalikan oleh server.");
        return null;
      }
    } catch (err) {
      console.error("❌ Gagal submit ujian:", err);
      return null;
    }
  };

  function toAbsoluteImageSrc(html) {
    const baseURL = api.defaults.baseURL;
  
    return html.replace(/src="\/uploads/g, `src="${baseURL}/uploads`);
  }

  const handleJawab = (soalId, jawaban) => {
    setJawabanSiswa((prev) => ({ ...prev, [soalId]: jawaban }));
    simpanJawabanKeServer(soalId, jawaban);
  };

  const toggleRagu = (soalId) => {
    setRaguRagu((prev) => ({
      ...prev,
      [soalId]: !prev[soalId],
    }));
  };

  const simpanTimerKeServer = async (detikSisa) => {
    try {
      await api.post("/answertrail/timer-save", {
        user_id: userId,
        course_id: courseId,
        waktu_tersisa: detikSisa
      });
    } catch (err) {
      console.error("❌ Gagal simpan waktu:", err.message);
    }
  };  

  useEffect(() => {
    if (!userId || !courseId || soalList.length === 0 || showStartModal) return;
  
    const interval = setInterval(() => {
      simpanTimerKeServer(waktuRef.current);
    }, 5000);
  
    return () => clearInterval(interval);
  }, [userId, courseId, soalList.length, showStartModal]);   

  useEffect(() => {
    const fetchCourseConfig = async () => {
      try {
        const res = await api.get(`/courses/${id}`);
        setShowResult(res.data.showResultToStudent === 1);
      } catch (err) {
        console.error("Gagal ambil config course:", err);
      }
    };
  
    fetchCourseConfig();
  }, [id]);  

const sendToBridge = (message) => {
  const maxRetries = 12; // Maks 12x coba (6 detik total)
  let attempts = 0;

  const trySend = () => {
    const androidReady = window.Android && typeof window.Android.postMessage === 'function';
    const webview2Ready = window.chrome && window.chrome.webview && typeof window.chrome.webview.postMessage === 'function';

    if (androidReady) {
      console.log(`[Bridge] ✅ Android bridge ready. Sending:`, message);
      window.Android.postMessage(JSON.stringify(message));
      return true;
    }

    if (webview2Ready) {
      console.log(`[Bridge] ✅ WebView2 bridge ready. Sending:`, message);
      window.chrome.webview.postMessage(message);
      return true;
    }

    if (attempts < maxRetries) {
      attempts++;
      console.warn(`[Bridge] ⏳ Bridge not ready, retry ${attempts}/${maxRetries}...`);
      setTimeout(trySend, 500);
    } else {
      console.error(`[Bridge] ❌ Failed to send after ${maxRetries} attempts.`);
      alert("Aplikasi tidak bisa menutup diri otomatis. Silakan tekan tombol Unlock manual di pojok kanan atas.");
    }
  };

  // Tunggu hingga DOM siap sebelum mencoba bridge
  if (document.readyState === "complete") {
    trySend();
  } else {
    window.addEventListener("load", trySend);
  }
};

const handleSelesaiUjian = async () => {
  setLoadingSubmit(true);

  try {
    const attemptId = await submitJawabanUjian();

    if (!attemptId) {
      alert("❌ Gagal menyimpan jawaban. Aplikasi akan ditutup.");
      sendToBridge({ type: 'unlock' });
      return;
    }

    // Hapus timer lokal
    localStorage.removeItem(`timer-${userId}-${courseId}`);

    // Update backend
    try {
      await api.delete("/answertrail/timer-delete", { params: { user_id: userId, course_id: courseId } });
    } catch (err) {
      console.warn("❌ Gagal hapus timer di backend:", err.message);
    }

    try {
      await api.post("/exam/status", { user_id: userId, course_id: courseId, status: "Tidak Sedang mengerjakan" });
    } catch (err) {
      console.error("❌ Gagal update status:", err.message);
    }

    // Cek hasil
    try {
      const res = await api.get(`/jawaban/show-result`, { params: { course_id: courseId } });
      const { tampilkan_hasil, analisis_jawaban } = res.data;

      const hasilPath = analisis_jawaban
        ? `/courses/${courseId}/${userId}/${attemptId}/hasil`
        : tampilkan_hasil
        ? `/courses/${courseId}/${userId}/${attemptId}/summary`
        : null;

      if (hasilPath) {
        const hasilFullUrl = window.location.origin + hasilPath;
        console.log(`[Bridge] Redirecting to ${hasilFullUrl}`);
        sendToBridge({ type: 'redirect', url: hasilFullUrl });
      } else {
        console.log("[Bridge] Unlocking without redirect.");
        sendToBridge({ type: 'unlock' });
      }

      // Browser fallback
      if (!window.Android && !(window.chrome && window.chrome.webview)) {
        navigate(hasilPath || '/', { replace: true });
      }

    } catch (err) {
      console.error("❌ Gagal cek hasil, unlocking as fallback:", err.message);
      sendToBridge({ type: 'unlock' });
      if (!window.Android && !(window.chrome && window.chrome.webview)) {
        navigate(`/`, { replace: true });
      }
    }

  } catch (err) {
    console.error("❌ Error in handleSelesaiUjian:", err.message);
    sendToBridge({ type: 'unlock' });
    alert("Terjadi kesalahan. Aplikasi akan ditutup.");
  } finally {
    setLoadingSubmit(false);
  }
};

  const formatWaktu = (detik) => {
    if (typeof detik !== 'number' || isNaN(detik) || detik < 0) detik = 0;
    const jam = Math.floor(detik / 3600).toString().padStart(2, '0');
    const menit = Math.floor((detik % 3600) / 60).toString().padStart(2, '0');
    const dtk = (detik % 60).toString().padStart(2, '0');
    return `${jam}:${menit}:${dtk}`;
  };  

  const renderSidebarContent = () => (
    <>
      <div className="flex-1 overflow-y-auto">
        {pgQuestions.length > 0 && (
          <div className="mb-4">
            <h4 className="text-md font-semibold text-gray-700 mb-2">Pilihan Ganda</h4>
            <div className="grid grid-cols-5 gap-2">
              {pgQuestions.map((soal, index) => {
                const isCurrent = index === currentIndex;
                const isAnswered = jawabanSiswa[soal.id];
                const isMarked = raguRagu[soal.id];
                let btnClass = 'bg-gray-200 text-gray-700 hover:bg-gray-300';
                if (isAnswered) btnClass = 'bg-green-500 text-white hover:bg-green-600';
                if (isMarked) btnClass = 'bg-yellow-400 text-white hover:bg-yellow-500';
                if (isCurrent) btnClass = 'bg-blue-600 text-white ring-2 ring-blue-300 ring-offset-1';
                return (
                  <button
                    key={soal.id}
                    onClick={() => {
                      setCurrentIndex(index);
                      setShowSidebar(false);
                    }}
                    className={`w-10 h-10 rounded-md font-bold text-sm transition-all duration-200 flex items-center justify-center ${btnClass}`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {essayQuestions.length > 0 && (
          <div>
            <h4 className="text-md font-semibold text-gray-700 mb-2">Soal Esai</h4>
            <div className="grid grid-cols-5 gap-2">
              {essayQuestions.map((soal, index) => {
                const overallIndex = pgQuestions.length + index;
                const isCurrent = overallIndex === currentIndex;
                const isAnswered = jawabanSiswa[soal.id];
                const isMarked = raguRagu[soal.id];
                let btnClass = 'bg-gray-200 text-gray-700 hover:bg-gray-300';
                if (isAnswered) btnClass = 'bg-green-500 text-white hover:bg-green-600';
                if (isMarked) btnClass = 'bg-yellow-400 text-white hover:bg-yellow-500';
                if (isCurrent) btnClass = 'bg-blue-600 text-white ring-2 ring-blue-300 ring-offset-1';
                return (
                  <button
                    key={soal.id}
                    onClick={() => {
                      setCurrentIndex(overallIndex);
                      setShowSidebar(false);
                    }}
                    className={`w-10 h-10 rounded-md font-bold text-sm transition-all duration-200 flex items-center justify-center ${btnClass}`}
                  >
                    {overallIndex + 1}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div className="mt-4 border-t pt-3">
        <h4 className="text-sm font-semibold text-gray-600 mb-3">Legenda:</h4>
        <ul className="space-y-2 text-xs text-gray-600">
          <li className="flex items-center gap-2"><div className="w-4 h-4 rounded-sm bg-green-500"></div><span>Sudah Dijawab</span></li>
          <li className="flex items-center gap-2"><div className="w-4 h-4 rounded-sm bg-yellow-400"></div><span>Ragu-ragu</span></li>
          <li className="flex items-center gap-2"><div className="w-4 h-4 rounded-sm bg-gray-200"></div><span>Belum Dijawab</span></li>
          <li className="flex items-center gap-2"><div className="w-4 h-4 rounded-sm bg-blue-600"></div><span>Soal Aktif</span></li>
        </ul>
      </div>
    </>
  );  

  const isSubmitAllowed = () => {
    if (!minWaktuSubmit || isNaN(minWaktuSubmit) || minWaktuSubmit <= 0) {
      return true;
    }
  
    return waktuSisa <= minWaktuSubmit * 60;
  };   

  if (isLoadingAccess) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50 text-gray-600">
        <ImSpinner2 className="animate-spin text-2xl mr-3" />
        Memverifikasi akses ujian...
      </div>
    );
  }

  if (!isAccessAllowed) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md text-center">
          <FiAlertTriangle className="text-red-500 mx-auto text-5xl mb-4" />
          <h1 className="text-2xl font-bold text-red-700 mb-2">Akses Ditolak</h1>
          <p className="text-gray-600 max-w-sm">
            Ujian ini diwajibkan untuk dibuka menggunakan aplikasi pengaman khusus. Silakan buka aplikasi tersebut dan coba lagi.
          </p>
          <button
            onClick={() => navigate("/courses")}
            className="mt-6 px-5 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
          >
            Kembali ke Daftar Ujian
          </button>
        </div>
      </div>
    );
  }

  if (blocked) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center">
        <h1 className="text-3xl font-bold text-red-600 mb-4">Kesempatan Habis</h1>
        <p className="text-gray-600">
          Anda sudah mencapai maksimal percobaan ({maxInfo?.max}x). Silakan hubungi guru.
        </p>
        <button
          onClick={() => navigate("/courses")}
          className="mt-6 px-4 py-2 bg-blue-600 text-white rounded"
        >
          Kembali
        </button>
      </div>
    );
  }

  if (showStartModal) {
    if (authChecked && !sudahInputToken) {
      return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-60 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-sm text-center">
            <h2 className="text-xl font-bold mb-2 text-red-600">Token Belum Divalidasi</h2>
            <p className="text-gray-600 mb-4">Anda belum memasukkan token ujian. Silakan kembali dan masukkan token terlebih dahulu.</p>
            <button
              onClick={() => navigate(-1)}
              className="bg-red-500 text-white px-5 py-2 rounded-lg hover:bg-red-600 font-semibold"
            >
              Kembali
            </button>
          </div>
        </div>
      );
    }
  
    if (!authChecked) {
      return (
        <div className="flex justify-center items-center h-screen">
          <p className="text-gray-600 text-lg">Memverifikasi token ujian...</p>
        </div>
      );
    }
  
    return (
      <div className="fixed inset-0 bg-gray-900 bg-opacity-60 flex justify-center items-center z-50">
        <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md text-center transform transition-all">
          <FiCheckCircle className="text-green-500 mx-auto text-5xl mb-4" />
          <h2 className="text-2xl font-bold mb-2 text-gray-800">Anda Akan Memulai Ujian</h2>
          <p className="mb-6 text-gray-600">Pastikan koneksi internet Anda stabil. Setelah dimulai, waktu akan berjalan. Apakah Anda siap?</p>
          <div className="flex justify-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="px-6 py-2 rounded-lg font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
            >
              Kembali
            </button>
            <button
              onClick={async () => {
                try {
                  const user_id = Cookies.get("user_id");
                  const token = Cookies.get("token");

                  if (!user_id || !token) {
                    alert("User belum login atau token hilang.");
                    return;
                  }

                  await api.post("/exam/status", {
                    user_id,
                    course_id: courseId,
                    status: `Mengerjakan - ${courseTitle}`,
                  });

                  navigate(`/courses/${courseId}/do`);

                  setShowStartModal(false);
                } catch (err) {
                  console.error("❌ Gagal memulai ujian:", err);
                  alert("Gagal memulai ujian. Coba lagi.");
                }
              }}
              className="px-6 py-2 rounded-lg font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Mulai Kerjakan
            </button>

          </div>
        </div>
      </div>
    );
  }  

  if (isLoading || !currentSoal) {
    return (
        <div className="flex justify-center items-center h-screen bg-gray-50 text-gray-600">
            Memuat soal, mohon tunggu...
        </div>
    );
  }
  
  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans">
      <header className="flex items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Ujian {examTitle}</h1>
          <p className="text-sm text-gray-500">
            {currentSoal.tipe_soal === 'pilihan_ganda' ? 'Soal Pilihan Ganda' : 'Soal Esai'} No. {currentIndex + 1} dari {soalList.length}
          </p>
        </div>
        <div className="flex items-center gap-4 bg-gray-100 border border-gray-200 p-2 rounded-lg">
          <FiClock className="text-blue-600" size={20} />
          <span className="text-xl font-semibold text-gray-800 font-mono" aria-label="Sisa Waktu">
            {formatWaktu(waktuSisa)}
          </span>
        </div>
      </header>
  
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto min-w-0">
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
  <div
    className="prose max-w-none mb-6 text-gray-800"
    dangerouslySetInnerHTML={{ __html: toAbsoluteImageSrc(currentSoal.soal) }}
  />

  {currentSoal.tipe_soal === 'pilihan_ganda' ? (
    <div className="space-y-3">
      {opsiArray.map((opsi, idx) => {
        const huruf = String.fromCharCode(65 + idx);
        const opsiAsli = currentSoal.opsiMapping[idx].slice(0, 1);
        const isSelected = jawabanSiswa[currentSoal.id] === opsiAsli;

        const opsiBersih = bersihkanOpsi(opsi);

        return (
          <label
            key={idx}
            className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
              isSelected
                ? "bg-blue-50 border-blue-500 shadow-sm"
                : "bg-white border-gray-300 hover:border-blue-400"
            }`}
          >
            <input
              type="radio"
              name={`soal-${currentSoal.id}`}
              value={opsiAsli}
              checked={isSelected}
              onChange={() => handleJawab(currentSoal.id, opsiAsli)}
              className="hidden"
            />
            <span
              className={`flex items-center justify-center w-6 h-6 mr-4 border rounded-full text-sm font-bold ${
                isSelected
                  ? "bg-blue-500 border-blue-500 text-white"
                  : "border-gray-400 text-gray-600"
              }`}
            >
              {huruf}
            </span>
            <span
              className="text-gray-700 prose max-w-none"
              dangerouslySetInnerHTML={{
                __html: toAbsoluteImageSrc(opsiBersih),
              }}
            />
          </label>
        );
      })}
    </div>
  ) : (
    <div>
      <JoditEditor
        value={jawabanSiswa[currentSoal.id] || ''}
        config={editorConfig}
        onChange={onEditorChange}
      />
    </div>
  )}
</div>

  
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => toggleRagu(currentSoal.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors ${
                  raguRagu[currentSoal.id]
                    ? "bg-yellow-100 text-yellow-800 border border-yellow-300 hover:bg-yellow-200"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                <FiFlag />
                {raguRagu[currentSoal.id] ? "Hapus Tanda" : "Tandai Ragu-Ragu"}
              </button>
  
              <button
                onClick={() => {
                  const updated = { ...jawabanSiswa };
                  delete updated[currentSoal.id];
                  setJawabanSiswa(updated);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-red-600 border border-red-300 bg-red-50 hover:bg-red-100 transition-colors"
              >
                🗑️ Hapus Pilihan
              </button>
            </div>
  
            <div className="flex gap-4 flex-wrap">
              <button
                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                disabled={currentIndex === 0}
                className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-semibold hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FiChevronLeft />
                Sebelumnya
              </button>
  
              {currentIndex === soalList.length - 1 ? (
                isSubmitAllowed() ? (
                  <button
                    onClick={() => setShowSelesaiModal(true)}
                    className="bg-green-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors shadow-sm"
                  >
                    Selesai Ujian
                  </button>
                ) : (
                  <div className="text-center">
                    <button
                      disabled
                      className="bg-gray-300 text-gray-500 cursor-not-allowed px-6 py-2 rounded-lg font-semibold mb-2"
                      title={`Jawaban hanya bisa dikirim jika sisa waktu ≤ ${minWaktuSubmit} menit.`}
                    >
                      Tidak Bisa Submit
                    </button>
                    {minWaktuSubmit > 0 && waktuSisa > minWaktuSubmit * 60 && (
                      <p className="text-sm text-gray-500">
                        Bisa submit dalam{" "}
                        <span className="font-semibold text-blue-600">
                          {formatMenitDetik(waktuSisa - minWaktuSubmit * 60)}
                        </span>
                      </p>
                    )}
                  </div>
                )
              ) : (
                <button
                  onClick={() => setCurrentIndex((i) => Math.min(soalList.length - 1, i + 1))}
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-sm"
                >
                  Selanjutnya <FiChevronRight />
                </button>
              )}
            </div>
          </div>
        </main>
  
        <aside className="hidden md:block w-72 bg-white border-l border-gray-200 p-4 flex flex-col overflow-y-auto">
          {renderSidebarContent()}
        </aside>
  
        {showSidebar && (
          <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-end md:hidden">
            <div className="w-11/12 max-w-xs bg-white p-4 shadow-xl h-full flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-md font-bold text-gray-800">Navigasi Soal</h3>
                <button onClick={() => setShowSidebar(false)} className="text-gray-500 hover:text-gray-800">✖</button>
              </div>
              {renderSidebarContent()}
            </div>
          </div>
        )}
      </div>
  
      <button
        className="md:hidden fixed bottom-4 right-4 bg-blue-600 text-white p-3 rounded-full shadow-lg z-40"
        onClick={() => setShowSidebar(true)}
      >
        🧭
      </button>
  
      {showSelesaiModal && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-60 flex justify-center items-center z-50">
          <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md text-center transform transition-all">
            <FiAlertTriangle className="text-yellow-500 mx-auto text-5xl mb-4" />
            <h2 className="text-2xl font-bold mb-2 text-gray-800">Akhiri Ujian?</h2>
            <p className="mb-6 text-gray-600">
              Apakah Anda yakin ingin menyelesaikan dan mengirim semua jawaban Anda sekarang?
            </p>
  
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setShowSelesaiModal(false)}
                disabled={loadingSubmit}
                className={`px-6 py-2 rounded-lg font-semibold ${
                  loadingSubmit ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                } transition-colors`}
              >
                Batal
              </button>
  
              <button
                onClick={async () => {
                  setLoadingSubmit(true);
                  await handleSelesaiUjian();
                  setLoadingSubmit(false);
                }}
                disabled={loadingSubmit}
                className={`px-6 py-2 rounded-lg font-semibold flex items-center justify-center gap-2 ${
                  loadingSubmit ? 'bg-green-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
                } text-white transition`}
              >
                {loadingSubmit ? (
                  <>
                    <ImSpinner2 className="animate-spin text-xl" />
                    Menyimpan...
                  </>
                ) : (
                  'Ya, Kirim Jawaban'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DoExamPage;
