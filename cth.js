import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Cookies from "js-cookie";
import api from "../api";
import { toast } from "../utils/toast";

import {
  FiPlus, FiSearch, FiBookOpen, FiSettings,
  FiTrash2, FiChevronRight, FiAlertCircle, FiLoader
} from "react-icons/fi";

function CoursesPage() {
  const [courses, setCourses] = useState([]);
  const [kelasList, setKelasList] = useState([]);
  const [subfolders, setSubfolders] = useState([]);
  const [statusMap, setStatusMap] = useState({});

  const [selectedKelas, setSelectedKelas] = useState("all");
  const [search, setSearch] = useState("");
  const [openFolders, setOpenFolders] = useState({});

  const [loading, setLoading] = useState(true);
  const [movingCourse, setMovingCourse] = useState(false);
  
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState(null);

  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [confirmationAction, setConfirmationAction] = useState(null);
  const [confirmationMessage, setConfirmationMessage] = useState("");
  const [confirmationButtonText, setConfirmationButtonText] = useState("Ya, Lanjutkan");


  const [showPromptModal, setShowPromptModal] = useState(false);
  const [promptAction, setPromptAction] = useState(null);
  const [promptMessage, setPromptMessage] = useState("");
  const [promptDefaultValue, setPromptDefaultValue] = useState("");

  const navigate = useNavigate();
  const role = Cookies.get("role");
  const name = Cookies.get("name");
  const userId = Cookies.get("user_id");
  const now = new Date();

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchKelasList(),
        fetchSubfolders(),
        fetchCoursesAndStatus(),
      ]);
    } catch (err) {
      console.error("❌ Gagal memuat data awal:", err);
      toast.error("Gagal memuat data course. Coba refresh halaman.");
    } finally {
      setLoading(false);
    }
  };

  const fetchCoursesAndStatus = async () => {
    try {
      const isSiswa = role === "siswa";
      let kelasSiswa = null;

      if (isSiswa) {
        const userRes = await api.get(`/users?name=${encodeURIComponent(name)}`);
        kelasSiswa = userRes.data?.kelas;
      }
      
      const url = isSiswa && kelasSiswa ? `/courses?kelas=${kelasSiswa}` : "/courses";
      const res = await api.get(url);
      setCourses(res.data);
      await fetchStatusMap(res.data);
    } catch (err) {
        console.error("❌ Gagal ambil courses & status:", err);
        toast.error("Gagal memuat daftar course.");
    }
  };

  const fetchKelasList = async () => {
    try {
      const res = await api.get("/data/kelas");
      setKelasList(res.data);
    } catch (err) {
      console.error("Gagal ambil data kelas:", err);
    }
  };

  const fetchSubfolders = async () => {
    try {
      const res = await api.get("/subfolders");
      setSubfolders(res.data);
    } catch (err) {
      console.error("Gagal ambil subfolders:", err);
    }
  };

  const fetchStatusMap = async (courseList) => {
    const statusPromises = courseList.map(course =>
      api.get(`/courses/${course.id}/status?user=${userId}`)
        .then(res => ({ [course.id]: res.data }))
        .catch(err => {
          console.error(`Gagal ambil status course ${course.id}:`, err);
          return { [course.id]: {} };
        })
    );
    const statuses = await Promise.all(statusPromises);
    setStatusMap(Object.assign({}, ...statuses));
  };


  useEffect(() => {
    fetchInitialData();
  }, [role, name]);

  const handleManageClick = (id) => navigate(`/courses/${id}/manage`);

  const handleDeleteCourse = (courseId) => {
    setConfirmationMessage("Anda yakin ingin menghapus Assesmen ini secara permanen? Tindakan ini tidak dapat diurungkan.");
    setConfirmationButtonText("Ya, Hapus");
    setConfirmationAction(() => async () => {
      try {
        await api.delete(`/courses/${courseId}`);
        toast.success("✅ Course berhasil dihapus");
        setCourses(courses.filter(c => c.id !== courseId));
      } catch (err) {
        console.error("Gagal hapus course:", err);
        toast.error("❌ Gagal menghapus course.");
      }
    });
    setShowConfirmationModal(true);
  };
  
  const handleDuplicateCourse = (id) => {
    setConfirmationMessage("Yakin ingin menduplikat Assesmen ini? Assesmen baru akan dibuat sebagai salinan.");
    setConfirmationButtonText("Ya, Duplikat");
    setConfirmationAction(() => async () => {
      try {
        await api.post(`/courses/${id}/duplicate`);
        toast.success("✅ Course berhasil diduplikat");
        fetchInitialData();
      } catch (err) {
        console.error("❌ Gagal duplikat course:", err);
        toast.error("Gagal menduplikat course.");
      }
    });
    setShowConfirmationModal(true);
  };

  const launchRushlessSafer = (courseId) => {
    const targetUrl = `${window.location.origin}/courses/${courseId}/do`;
    const allCookies = document.cookie;

    const encodedUrl = encodeURIComponent(targetUrl);
    const encodedCookies = encodeURIComponent(allCookies);

    const isAndroid = /Android/i.test(navigator.userAgent);
    const protocolUrl = isAndroid
      ? `rushless-safer://exam?url=${encodedUrl}&cookies=${encodedCookies}`
      : `rushless-safer:?url=${encodedUrl}&cookies=${encodedCookies}`;

    toast.success("🔒 Meluncurkan Aplikasi Ujian Aman...");
    window.location.href = protocolUrl;
  };

  const handleDoClick = async (courseId) => {
    try {
      const { data: course } = await api.get(`/courses/${courseId}`);
      const mulai = new Date(course.tanggal_mulai);
      const selesai = course.tanggal_selesai ? new Date(course.tanggal_selesai) : null;

      if (now < mulai) return toast.warn("⏳ Ujian belum dimulai.");
      if (selesai && now > selesai) return toast.error("🕔 Waktu ujian sudah berakhir.");

      const { data: status } = await api.get(`/courses/${courseId}/status?user=${userId}`);
      if (status.sudahMaksimal) return toast.error("❌ Kesempatan Anda sudah habis.");

      if (status.useToken) {
        setSelectedCourseId(courseId);
        setTokenInput("");
        setShowTokenModal(true);
      } else {
        await api.post("/exam/status", {
          user_id: userId,
          course_id: courseId,
          status: `Mengerjakan - ${course.nama || course.title}`,
        });

        if (course.use_secure_app) {
          const isWindows = /Windows/i.test(navigator.userAgent);
          const isAndroid = /Android/i.test(navigator.userAgent);
          if (isWindows || isAndroid) {
            launchRushlessSafer(courseId);
          } else {
            toast.error("Ujian ini wajib menggunakan aplikasi pengaman Windows atau Android.");
          }
        } else {
          navigate(`/courses/${courseId}/do`);
        }
      }
    } catch (err) {
      console.error("❌ Gagal cek waktu/status:", err);
      toast.error("Gagal memeriksa status ujian.");
    }
  };

  const handleSubmitToken = async (e) => {
    e.preventDefault();
    if (!tokenInput) return;
  
    try {
      const res = await api.post(`/courses/${selectedCourseId}/validate-token`, {
        token: tokenInput,
        user: userId,
      });
  
      if (res.data.valid) {
        await api.post("/courses/tokenAuth", {
          course_id: selectedCourseId,
          user_id: userId,
        });
  
        toast.success("✅ Token valid! Memulai ujian...");
        setShowTokenModal(false);

        const { data: course } = await api.get(`/courses/${selectedCourseId}`);

        await api.post("/exam/status", {
          user_id: userId,
          course_id: selectedCourseId,
          status: `Mengerjakan - ${course.nama || course.title}`,
        });

        if (course.use_secure_app) {
          const isWindows = /Windows/i.test(navigator.userAgent);
          if (isWindows) {
            launchRushlessSafer(selectedCourseId);
          } else {
            toast.error("Ujian ini wajib menggunakan aplikasi pengaman Windows.");
          }
        } else {
          navigate(`/courses/${selectedCourseId}/do`);
        }
      } else {
        toast.error("❌ Token salah atau kedaluwarsa.");
      }
    } catch (err) {
      console.error("❌ Gagal validasi token:", err);
      toast.error("Gagal memvalidasi token.");
    }
  };

  const toggleVisibility = async (id, currentHidden) => {
    try {
      await api.put(`/courses/${id}/toggle-visibility`, { hidden: !currentHidden });
      toast.success(`Visibilitas course berhasil diubah.`);
      setCourses(courses.map(c => c.id === id ? { ...c, hidden: !c.hidden } : c));
    } catch (err) {
      console.error("🚫 Gagal toggle visibility:", err);
      toast.error("Gagal mengubah visibilitas course.");
    }
  };

  const moveCourse = async (courseId, toSubfolderName) => {
    setMovingCourse(true);
    try {
      await api.put("/subfolders/move-course", {
        courseId,
        toSubfolderId: toSubfolderName === "Tanpa Folder" ? null : toSubfolderName
      });
      toast.success(`Course berhasil dipindahkan.`);
      await fetchInitialData();
    } catch (err) {
      console.error("Gagal memindahkan course:", err);
      toast.error("❌ Gagal memindahkan course.");
    } finally {
      setMovingCourse(false);
    }
  };

  const createSubfolder = () => {
    setPromptMessage("Masukkan nama folder baru:");
    setPromptDefaultValue("");
    setPromptAction(() => async (name) => {
      if (name && name.trim()) {
        try {
          await api.post("/subfolders", { name: name.trim() });
          toast.success("✅ Folder baru berhasil dibuat");
          await fetchInitialData();
        } catch (err) {
          toast.error(err.response?.data?.error || "❌ Gagal membuat folder");
          console.error(err);
        }
      }
    });
    setShowPromptModal(true);
  };
  
  const renameFolder = (oldName) => {
    setPromptMessage(`Ganti nama folder "${oldName}":`);
    setPromptDefaultValue(oldName);
    setPromptAction(() => async (newName) => {
      if (newName && newName.trim() && newName.trim() !== oldName) {
        try {
          await api.put(`/subfolders/${encodeURIComponent(oldName)}/rename`, { newName: newName.trim() });
          toast.success("Folder berhasil di-rename.");
          await fetchInitialData();
        } catch (err) {
          console.error("❌ Gagal rename folder:", err);
          toast.error("Gagal me-rename folder.");
        }
      }
    });
    setShowPromptModal(true);
  };

  const handleDeleteSubfolder = (folderName) => {
    setConfirmationMessage(`Yakin ingin menghapus folder "${folderName}"? Pengelompokan Assesmen akan dihapus, Assesmen course di dalamnya tidak akan terhapus.`);
    setConfirmationButtonText("Ya, Hapus Folder");
    setConfirmationAction(() => async () => {
      try {
        await api.delete(`/subfolders/${encodeURIComponent(folderName)}`);
        toast.success("✅ Folder berhasil dihapus.");
        await fetchInitialData();
      } catch (err) {
        console.error("❌ Gagal hapus folder:", err);
        toast.error("Gagal menghapus folder.");
      }
    });
    setShowConfirmationModal(true);
  };

  const toggleFolder = (folderName) => {
    setOpenFolders(prev => ({ ...prev, [folderName]: !prev[folderName] }));
  };

  const filteredCourses = courses.filter((course) => {
    const isExamCourse = course.waktu && course.waktu > 0;

    const matchKelas =
      selectedKelas === "all" ||
      (Array.isArray(course.kelas)
        ? course.kelas.includes(selectedKelas)
        : course.kelas === selectedKelas);
    const matchSearch = course.nama.toLowerCase().includes(search.toLowerCase());
    return isExamCourse && matchKelas && matchSearch;
  });

  const grouped = {};
  subfolders.forEach((folder) => { grouped[folder.name] = []; });
  
  let tanpaFolderCourses = [];
  filteredCourses.forEach((course) => {
    const folder = course.subfolder;
    if (folder && grouped.hasOwnProperty(folder)) {
      grouped[folder].push(course);
    } else {
      tanpaFolderCourses.push(course);
    }
  });

  if (tanpaFolderCourses.length > 0) {
    grouped["Tanpa Folder"] = tanpaFolderCourses;
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-slate-50">
        <FiLoader className="animate-spin text-4xl text-indigo-600" />
        <p className="ml-3 text-lg text-slate-700">Memuat Courses...</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Assesmen</h1>
            <p className="text-slate-500 mt-1">
              Selamat datang kembali, {name}. Pilih Assesmen untuk dimulai.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {role !== "siswa" && (
              <button
                onClick={createSubfolder}
                className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-semibold hover:bg-slate-100 transition-colors duration-200"
              >
                <FiPlus /> Folder Baru
              </button>
            )}
            {role !== "siswa" && (
              <button
                onClick={() => navigate("/createcourses")}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-transform transform hover:scale-105"
              >
                <FiPlus /> Buat Assesmen
              </button>
            )}
          </div>
        </header>
  
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-grow">
            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari berdasarkan nama Assesmen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-slate-300 pl-10 pr-4 py-2.5 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
            />
          </div>
          {role !== "siswa" && (
            <select
              value={selectedKelas}
              onChange={(e) => setSelectedKelas(e.target.value)}
              className="border border-slate-300 px-4 py-2.5 rounded-lg w-full sm:w-auto md:w-52 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
            >
              <option value="all">Semua Kelas</option>
              {kelasList.map((k) => (
                <option key={k.id} value={k.nama_kelas}>
                  {k.nama_kelas}
                </option>
              ))}
            </select>
          )}
        </div>
  
        {Object.keys(grouped).length === 0 ? (
          <div className="text-center py-20 bg-white rounded-lg shadow-sm border">
            <FiAlertCircle className="mx-auto text-5xl text-slate-400 mb-4" />
            <h3 className="text-xl font-semibold text-slate-700">Tidak Ada Course Ditemukan</h3>
            <p className="text-slate-500 mt-2">Coba ubah kata kunci pencarian atau filter kelas Anda.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([folderName, coursesInFolder]) => {
              const isHiddenForSiswa = role === "siswa" && coursesInFolder.every((c) => c.hidden);
  
              return (
                <div key={folderName} className="bg-white rounded-xl shadow-sm border border-slate-200">
                  <div
                    className="flex justify-between items-center px-4 sm:px-6 py-3 bg-slate-50/50 hover:bg-slate-100 transition cursor-pointer rounded-t-xl"
                    onClick={() => toggleFolder(folderName)}
                  >
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg font-semibold text-slate-800">{folderName}</h2>
                      <span className="hidden sm:block text-sm text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">
                        {coursesInFolder.length} Assesmen
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {role === "admin" && folderName !== "Tanpa Folder" && (
                        <div className="flex items-center gap-3">
                          <button onClick={(e) => { e.stopPropagation(); renameFolder(folderName);}} className="text-xs font-medium text-indigo-600 hover:text-indigo-800"> Rename </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteSubfolder(folderName);}} className="text-xs font-medium text-red-500 hover:text-red-700"> Hapus </button>
                        </div>
                      )}
                      <span className={`transform transition-transform duration-300 ${openFolders[folderName] ? 'rotate-90' : ''}`}>
                        <FiChevronRight className="text-slate-600" />
                      </span>
                    </div>
                  </div>
  
                  <div className={`grid transition-all duration-500 ease-in-out ${openFolders[folderName] ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                    <div className="overflow-hidden">
                      <div className="grid gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 p-4 sm:p-6">
                        {coursesInFolder.map((course) => (
                          <div key={course.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col group transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
                            <div className="h-32 bg-indigo-50 flex items-center justify-center"> <FiBookOpen className="text-4xl text-indigo-300" /> </div>
                            <div className="p-4 flex flex-col flex-grow">
                            {role !== "siswa" && (
                              <p className="text-xs font-semibold text-indigo-600 uppercase">
                                {Array.isArray(course.kelas) ? course.kelas.join(", ") : course.kelas}
                              </p>
                            )}
                              <h3 className="text-lg font-bold text-slate-800 mt-1 truncate group-hover:text-indigo-600 transition-colors"> {course.nama} </h3>
                              <p className="text-xs text-slate-500 mt-2"> {new Date(course.tanggal_mulai).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} </p>
                              <p className="text-xs text-slate-500"> Jam: {new Date(course.tanggal_mulai).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} </p>
                              {course.pengajar && (
                                <p className="text-xs text-slate-500 mt-2 italic">
                                  Oleh: {course.pengajar}
                                </p>
                              )}
                              <div className="mt-4 flex-grow"> <p className="text-sm text-slate-600 line-clamp-2">{course.deskripsi}</p> </div>
                            </div>
                            <div className="p-4 bg-slate-50/70 border-t border-slate-200 mt-auto">
                              {role === "siswa" ? (
                                (() => {
                                  const mulai = new Date(course.tanggal_mulai);
                                  const selesai = course.tanggal_selesai ? new Date(course.tanggal_selesai) : null;
                                  const sudahMaksimal = statusMap[course.id]?.sudahMaksimal;
                                  const belumMulai = now < mulai;
                                  const sudahSelesai = selesai && now > selesai;
                                  let btnClass = "bg-green-600 hover:bg-green-700 text-white"; let btnText = "Mulai Kerjakan"; let btnIcon = <FiChevronRight />; let isDisabled = false;
                                  if (sudahMaksimal) { btnClass = "bg-slate-300 text-slate-600 cursor-not-allowed"; btnText = "Sudah Dikerjakan"; btnIcon = null; isDisabled = true; } 
                                  else if (belumMulai) { btnClass = "bg-amber-400 text-amber-800 cursor-not-allowed"; btnText = "Belum Dimulai"; btnIcon = null; isDisabled = true; } 
                                  else if (sudahSelesai) { btnClass = "bg-red-400 text-red-800 cursor-not-allowed"; btnText = "Waktu Habis"; btnIcon = null; isDisabled = true; }
                                  return ( <button onClick={() => !isDisabled && handleDoClick(course.id)} disabled={isDisabled} className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${btnClass}`} > {btnText} {btnIcon} </button> );
                                })()
                              ) : (
                                <div className="space-y-3">
                                  <div className="flex justify-between items-center gap-2">
                                    <button onClick={() => handleManageClick(course.id)} className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"> <FiSettings size={14} /> Kelola </button>
                                    <button onClick={() => handleDuplicateCourse(course.id)} className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"> <FiPlus size={14} /> Duplikat </button>
                                    <button onClick={() => handleDeleteCourse(course.id)} className="flex items-center gap-1.5 text-sm font-medium text-red-500 hover:text-red-700 transition-colors"> <FiTrash2 size={14} /> Hapus </button>
                                  </div>
                                  <div className="border-t border-slate-200 pt-3 space-y-2">
                                    <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                                      <input type="checkbox" checked={!course.hidden} onChange={() => toggleVisibility(course.id, course.hidden)} className="w-4 h-4 text-indigo-600 bg-gray-100 border-gray-300 rounded focus:ring-indigo-500" /> Tampilkan ke siswa
                                    </label>
                                    <div>
                                      <label className="text-xs text-slate-500 block mb-1">Pindahkan folder:</label>
                                      <select value={course.subfolder || "Tanpa Folder"} onChange={(e) => moveCourse(course.id, e.target.value)} disabled={movingCourse} className="w-full border border-slate-300 px-2 py-1 rounded text-sm bg-white focus:ring-1 focus:ring-indigo-500 transition disabled:bg-slate-100" >
                                        <option value="Tanpa Folder">Tanpa Folder</option>
                                        {subfolders.map((f) => ( <option key={f.name} value={f.name}> {f.name} </option> ))}
                                      </select>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
  
      {showTokenModal && ( <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm"> <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 m-4 transform transition-all animate-in fade-in-90 slide-in-from-bottom-10"> <h2 className="text-xl font-bold mb-4 text-slate-800">Masukkan Token Ujian</h2> <p className="text-slate-500 mb-4 text-sm">Course ini memerlukan token untuk bisa diakses. Silakan minta token kepada pengajar.</p> <form onSubmit={handleSubmitToken}> <input type="text" value={tokenInput} onChange={(e) => setTokenInput(e.target.value.toUpperCase())} placeholder="TOKEN UJIAN" className="w-full text-center tracking-widest font-mono border border-slate-300 px-4 py-2.5 rounded-lg mb-4 focus:ring-2 focus:ring-indigo-500" autoFocus /> <div className="flex justify-end gap-3"> <button type="button" onClick={() => setShowTokenModal(false)} className="px-4 py-2 bg-slate-200 text-slate-800 rounded-lg hover:bg-slate-300 font-semibold transition-colors" > Batal </button> <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold transition-colors" > Kirim </button> </div> </form> </div> </div> )}
      {showConfirmationModal && ( <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm"> <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 m-4 animate-in fade-in-90"> <h2 className="text-xl font-bold mb-2 text-slate-800">Konfirmasi Tindakan</h2> <p className="text-slate-600 mb-6">{confirmationMessage}</p> <div className="flex justify-end gap-3"> <button onClick={() => setShowConfirmationModal(false)} className="px-4 py-2 bg-slate-200 text-slate-800 rounded-lg hover:bg-slate-300 font-semibold"> Batal </button> <button onClick={() => { if(confirmationAction) confirmationAction(); setShowConfirmationModal(false); }} className={`px-4 py-2 text-white rounded-lg font-semibold ${ confirmationButtonText.includes('Hapus') ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700' }`} > {confirmationButtonText} </button> </div> </div> </div> )}
      {showPromptModal && ( <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm"> <form onSubmit={(e) => { e.preventDefault(); const inputValue = e.currentTarget.elements.promptInput.value; if (promptAction) promptAction(inputValue); setShowPromptModal(false); }} className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 m-4 animate-in fade-in-90"> <h2 className="text-xl font-bold mb-2 text-slate-800">{promptMessage}</h2> <input name="promptInput" defaultValue={promptDefaultValue} className="w-full border border-slate-300 px-4 py-2.5 rounded-lg my-4 focus:ring-2 focus:ring-indigo-500" autoFocus /> <div className="flex justify-end gap-3"> <button type="button" onClick={() => setShowPromptModal(false)} className="px-4 py-2 bg-slate-200 text-slate-800 rounded-lg hover:bg-slate-300 font-semibold"> Batal </button> <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold"> Simpan </button> </div> </form> </div> )}
    </div>
  );
}

export default CoursesPage;