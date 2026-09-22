// Runtime-composed source module. Keep declarations in shared application scope.
const FC={apiKey:"AIzaSyA6W_C2H84heiVwDe_a6ElMwuEjvbR0aRo",authDomain:"havenspacedesign.vercel.app",projectId:"have000",storageBucket:"have000.firebasestorage.app",messagingSenderId:"758420593792",appId:"1:758420593792:web:29f485e949eca0ce031a65"};
const app=initializeApp(FC);
const db=getFirestore(app);
const auth=getAuth(app);
const storage=getStorage(app);
const provider=new GoogleAuthProvider();
