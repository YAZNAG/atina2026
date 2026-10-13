/// Traductions arabes, indexées par le texte français affiché par `t()`.
const arStrings = <String, String>{
  // Assistant
  'Dites-moi ce que vous cherchez : un secteur, une ville, un délai ou un budget.':
      'أخبرني بما تبحث عنه: قطاع، مدينة، أجل أو ميزانية.',
  'clôture sous 7 jours': 'ينتهي خلال 7 أيام',
  'clôture sous 30 jours': 'ينتهي خلال 30 يومًا',
  'publiés depuis 48 h': 'منشورة منذ 48 ساعة',
  'secteur privé': 'القطاع الخاص',
  "Je n'ai pas bien compris. Essayez par exemple : « travaux à Marrakech », « services qui clôturent cette semaine » ou « fournitures de plus de 5 millions ».":
      'لم أفهم جيدًا. جرّب مثلًا: «travaux à Marrakech» أو «services qui clôturent cette semaine» أو «fournitures de plus de 5 millions».',
  "Aucun appel d'offres ouvert ne correspond à : {c}. Élargissez la région ou retirez un critère.":
      'لا يوجد طلب عروض مفتوح يطابق: {c}. وسّع الجهة أو احذف معيارًا.',
  "J'ai trouvé 1 appel d'offres ouvert pour : {c}.":
      'وجدت طلب عروض مفتوحًا واحدًا لـ: {c}.',
  "J'ai trouvé {n} appels d'offres ouverts pour : {c}.":
      'وجدت {n} طلبات عروض مفتوحة لـ: {c}.',
  'Le plus urgent clôture le {date}.': 'الأكثر استعجالًا ينتهي في {date}.',
  "Attention : il reste {n} jour(s), préparez le dossier administratif et la caution dès aujourd'hui.":
      'تنبيه: بقي {n} يوم(أيام)، جهّز الملف الإداري والضمان ابتداءً من اليوم.',
  'Vous avez {n} jours pour préparer votre offre.':
      'لديك {n} أيام لإعداد عرضك.',
  "Voici l'essentiel :": 'إليك الأهم:',
  "Résume cet appel d'offres : {ref}": 'لخّص طلب العروض هذا: {ref}',
  'Assistant': 'المساعد',
  'Fonctionne hors ligne': 'يعمل دون اتصال',
  'Nouvelle conversation': 'محادثة جديدة',
  'Que cherchez-vous ?': 'عمّ تبحث؟',
  'Décrivez le marché voulu : secteur, ville, délai, budget. Je vous montre les avis ouverts qui correspondent.':
      'صِف الصفقة التي تريدها: القطاع، المدينة، الأجل، الميزانية. سأعرض عليك الإعلانات المفتوحة المطابقة.',
  'Ex. : travaux de voirie à Agadir': 'مثال: travaux de voirie à Agadir',
  'Envoyer': 'إرسال',
  'Travaux à Marrakech': 'أشغال في مراكش',
  'Services qui clôturent cette semaine': 'خدمات تنتهي هذا الأسبوع',
  'Fournitures de plus de 5 millions': 'توريدات بأكثر من 5 ملايين',
  'Consultations du secteur privé': 'استشارات القطاع الخاص',

  // Formats
  '{date} à {time}': '{date} على الساعة {time}',
  'MAD': 'درهم',
  'M MAD': 'مليون درهم',
  'k MAD': 'ألف درهم',
  'Ko': 'ك.ب',
  'Mo': 'م.ب',
  'Clôturé': 'منتهٍ',
  "Clôture aujourd'hui": 'ينتهي اليوم',
  'Clôture demain': 'ينتهي غدًا',
  '{n} jours restants': 'بقي {n} يومًا',
  "à l'instant": 'الآن',
  'il y a {n} h': 'منذ {n} ساعة',
  'il y a {n} j': 'منذ {n} يوم',

  // Tri et filtres
  'Plus récents': 'الأحدث',
  'Date limite proche': 'الأجل الأقرب',
  'Montant estimé': 'المبلغ التقديري',
  'Toutes': 'الكل',
  'Sous {n} jours': 'خلال {n} يومًا',
  '48 dernières heures': 'آخر 48 ساعة',
  '7 derniers jours': 'آخر 7 أيام',
  '30 derniers jours': 'آخر 30 يومًا',
  'Tous': 'الكل',
  'Moins de 1 M': 'أقل من مليون',
  '1 à 5 M': 'من 1 إلى 5 ملايين',
  '5 à 20 M': 'من 5 إلى 20 مليونًا',
  'Plus de 20 M': 'أكثر من 20 مليونًا',
  'Filtres': 'التصفية',
  'Réinitialiser': 'إعادة الضبط',
  'Catégorie': 'الصنف',
  'Secteur privé uniquement': 'القطاع الخاص فقط',
  'Date limite': 'آخر أجل',
  'Publication': 'النشر',
  'Montant estimé (MAD)': 'المبلغ التقديري (درهم)',
  'Procédure': 'المسطرة',
  'Région': 'الجهة',
  'Afficher 1 résultat': 'عرض نتيجة واحدة',
  'Afficher {n} résultats': 'عرض {n} نتيجة',
  'Fermer': 'إغلاق',

  // Catégories
  'Travaux': 'أشغال',
  'Services': 'خدمات',
  'Fournitures': 'توريدات',

  // Résumé
  'Objet : {title}.': 'الموضوع: {title}.',
  'Acheteur : {buyer}, exécution à {city}.':
      'المشتري: {buyer}، التنفيذ في {city}.',
  'Budget estimé : {v} TTC.': 'الميزانية التقديرية: {v} مع احتساب الرسوم.',
  'Caution provisoire à prévoir : {v}.': 'الضمان المؤقت المطلوب: {v}.',
  'Pas de caution provisoire exigée.': 'لا يُشترط ضمان مؤقت.',
  "Délai d'exécution : {d}.": 'أجل التنفيذ: {d}.',
  'Visite des lieux le {date}.': 'زيارة الموقع يوم {date}.',
  '{n} lots distincts.': '{n} حصص منفصلة.',

  // Alertes
  'Alertes': 'التنبيهات',
  'Me prévenir': 'أعلمني',
  "Nouveaux appels d'offres": 'طلبات عروض جديدة',
  "Dès qu'un avis correspond à mes critères": 'فور صدور إعلان يطابق معاييري',
  'Rappels de date limite': 'تذكير بآخر أجل',
  'Pour les avis enregistrés': 'للإعلانات المحفوظة',
  '{n} j avant': 'قبل {n} يوم',
  'Catégories suivies': 'الأصناف المتابَعة',
  'Mots-clés': 'الكلمات المفتاحية',
  "Une alerte part si l'avis contient au moins un de ces mots.":
      'يُرسل تنبيه إذا تضمّن الإعلان كلمة واحدة على الأقل من هذه الكلمات.',
  'Ex. : voirie, informatique, solaire': 'مثال: voirie، informatique، solaire',
  'Ajouter': 'إضافة',
  'Retirer': 'إزالة',
  'Régions': 'الجهات',
  'Tout le Maroc': 'كل المغرب',
  '{n} région(s) sélectionnée(s)': '{n} جهة مختارة',
  '{n} avis ouverts correspondent à ces critères':
      '{n} إعلانات مفتوحة تطابق هذه المعايير',
  'Enregistrer mes alertes': 'حفظ تنبيهاتي',
  'Alertes enregistrées': 'تم حفظ التنبيهات',

  // Hors ligne
  'Hors ligne': 'دون اتصال',
  'Aucun dossier téléchargé': 'لا يوجد ملف محمَّل',
  "Téléchargez le dossier d'un appel d'offres depuis sa fiche : il restera consultable même sans connexion.":
      'حمّل ملف طلب العروض من صفحته: سيبقى متاحًا حتى دون اتصال.',
  '1 dossier': 'ملف واحد',
  '{n} dossiers': '{n} ملفات',
  '{size} utilisés sur ce téléphone': '{size} مستعملة على هذا الهاتف',
  'Tout supprimer': 'حذف الكل',
  '{n} pièces': '{n} وثائق',
  'Supprimer': 'حذف',
  'Supprimer tous les dossiers ?': 'حذف جميع الملفات؟',
  'Ils ne seront plus consultables hors connexion.':
      'لن تكون متاحة بعد الآن دون اتصال.',
  'Annuler': 'إلغاء',

  // Accueil
  'Ouverts': 'مفتوحة',
  'Nouveaux 48 h': 'جديدة 48 س',
  'Clôture < 7 j': 'تنتهي < 7 أيام',
  "1 appel d'offres": 'طلب عروض واحد',
  "{n} appels d'offres": '{n} طلب عروض',
  'Aucun résultat': 'لا توجد نتائج',
  'Essayez un autre mot-clé ou retirez des filtres.':
      'جرّب كلمة مفتاحية أخرى أو أزل بعض عوامل التصفية.',
  'Tout réinitialiser': 'إعادة ضبط الكل',
  'Trouvez votre prochain marché': 'اعثر على صفقتك القادمة',
  "Appels d'offres publics et privés au Maroc":
      'طلبات العروض العمومية والخاصة في المغرب',
  'Mot-clé, acheteur, ville, référence…': 'كلمة مفتاحية، مشترٍ، مدينة، مرجع…',
  'Effacer': 'مسح',
  'Trier': 'ترتيب',
  'Explorer': 'استكشاف',
  'Données de démonstration : ces avis sont des exemples.':
      'بيانات تجريبية: هذه الإعلانات مجرد أمثلة.',
  'Limite': 'الأجل',

  // Bienvenue
  'Tous les avis au même endroit': 'كل الإعلانات في مكان واحد',
  "Appels d'offres publics et privés, mis à jour chaque jour.":
      'طلبات العروض العمومية والخاصة، محيَّنة كل يوم.',
  'Recherche précise': 'بحث دقيق',
  'Filtrez par secteur, région, date limite et budget.':
      'صفِّ حسب القطاع والجهة وآخر أجل والميزانية.',
  'Alertes sur mesure': 'تنبيهات حسب الطلب',
  "Soyez prévenu dès qu'un marché vous correspond.":
      'توصَّل بإشعار فور صدور صفقة تناسبك.',
  'Dossiers hors ligne': 'ملفات دون اتصال',
  'Téléchargez les pièces et consultez-les partout.':
      'حمّل الوثائق واطّلع عليها في أي مكان.',
  'Ne manquez plus aucun marché au Maroc.':
      'لا تفوّت أي صفقة في المغرب بعد اليوم.',
  'Commencer': 'ابدأ',

  // Enregistrés et réglages
  'Enregistrés': 'المحفوظة',
  'Aucun avis enregistré': 'لا يوجد إعلان محفوظ',
  "Touchez le marque-page d'un appel d'offres pour le retrouver ici, trié par date limite.":
      'اضغط على علامة الحفظ في طلب عروض لتجده هنا، مرتَّبًا حسب آخر أجل.',
  'Réglages': 'الإعدادات',
  'Langue': 'اللغة',
  '{n} avis ouverts correspondent': '{n} إعلانات مفتوحة مطابقة',
  '{n} avis': '{n} إعلانات',
  'Source des données': 'مصدر البيانات',
  'Exemples de démonstration, en attendant le serveur':
      'أمثلة تجريبية في انتظار الخادم',
  'Portail marocain des marchés publics': 'بوابة الصفقات العمومية المغربية',
  'Version': 'الإصدار',
  'Vérifiez toujours les conditions dans le dossier officiel avant de déposer une offre.':
      'تحقّق دائمًا من الشروط في الملف الرسمي قبل إيداع أي عرض.',

  // Fiche
  'Avis introuvable': 'الإعلان غير موجود',
  "Cet appel d'offres n'est plus disponible.": 'طلب العروض هذا لم يعد متاحًا.',
  'Copier la référence': 'نسخ المرجع',
  'Référence copiée': 'تم نسخ المرجع',
  'Retirer des enregistrés': 'إزالة من المحفوظة',
  'Enregistrer': 'حفظ',
  'Privé': 'خاص',
  'Lots ({n})': 'الحصص ({n})',
  "Demander à l'assistant": 'اسأل المساعد',
  'J-0': 'اليوم',
  'J-{n}': '{n} يومًا',
  'Date limite de dépôt': 'آخر أجل للإيداع',
  'Publié le {date}': 'نُشر في {date}',
  'Estimation': 'التقدير',
  'Non communiquée': 'غير مُعلن',
  'Caution provisoire': 'الضمان المؤقت',
  'Non exigée': 'غير مطلوب',
  "Lieu d'exécution": 'مكان التنفيذ',
  "Délai d'exécution": 'أجل التنفيذ',
  'Visite des lieux': 'زيارة الموقع',
  'Référence': 'المرجع',
  'Informations clés': 'معلومات أساسية',
  'En bref': 'باختصار',
  'Résumé automatique : vérifiez toujours le dossier officiel.':
      'ملخص آلي: تحقّق دائمًا من الملف الرسمي.',
  'Dossier de consultation': 'ملف الاستشارة',
  'Téléchargement… {p} %': 'جارٍ التحميل… {p}٪',
  'Disponible hors ligne': 'متاح دون اتصال',
  'Téléchargé {when}': 'تم التحميل {when}',
  'Télécharger le dossier ({size})': 'تحميل الملف ({size})',
};
