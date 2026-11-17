// İçecekler, alkollü içecekler ve sporcu takviyeleri (100 ml / 100 g)
export default `
# icecek ml
Su; 0 0 0 0 0 0 0; 1 bardak=200, 1 şişe=500
Maden suyu; 0 0 0 0 0 0 0.05; 1 şişe=200; soda
Çay (şekersiz); 1 0 0.3 0 0 0 0; 1 ince belli=100, 1 kupa=250; cay
Çay (1 şekerli); 13 0 3.3 0 0 3.3 0; 1 ince belli=100; cay sekerli
Çay (2 şekerli); 25 0 6.3 0 0 6.3 0; 1 ince belli=100; cay sekerli
Yeşil çay; 1 0.2 0 0 0 0 0; 1 kupa=250
Bitki çayı; 2 0 0.4 0 0 0 0; 1 kupa=250; ihlamur adacayi papatya
Türk kahvesi (sade); 4 0.2 0.6 0.1 0 0 0; 1 fincan=70; kahve
Türk kahvesi (orta şekerli); 32 0.2 7.7 0.1 0 7.2 0; 1 fincan=70; kahve
Türk kahvesi (sütlü); 45 2 5 1.8 0 4.5 0.1; 1 fincan=90; kahve
Dibek kahvesi; 25 0.5 4 0.8 0 3 0; 1 fincan=80; kahve
Menengiç kahvesi; 80 3 8 4 0 7 0.1; 1 fincan=150; kahve
Filtre kahve; 2 0.1 0 0 0 0 0; 1 kupa=250; kahve
Soğuk demleme kahve; 2 0.1 0.2 0 0 0 0; 1 bardak=350; cold brew kahve
Espresso; 9 0.1 1.7 0.2 0 0 0; 1 shot=30, 2 shot=60; kahve
Americano; 2 0.1 0.3 0 0 0 0; küçük=250, orta=350, büyük=450; kahve
Latte; 50 2.8 4.1 2.5 0 4.1 0.1; küçük=250, orta=350, büyük=450; kahve
Yağsız sütlü latte; 30 2.9 4.3 0.1 0 4.3 0.1; küçük=250, orta=350, büyük=450; kahve
Yulaf sütlü latte; 45 1 6 1.8 0.5 3 0.1; küçük=250, orta=350, büyük=450; kahve
Cappuccino; 38 2.1 3.3 1.8 0 3.3 0.1; 1 fincan=250; kahve
Flat white; 55 3 4.5 2.8 0 4.5 0.1; 1 fincan=200; kahve
Mocha; 75 2.8 10 2.8 0.5 9 0.1; küçük=250, orta=350, büyük=450; kahve
Karamel macchiato; 70 2.4 10.5 2 0 10 0.1; küçük=250, orta=350, büyük=450; kahve
Kremalı frappe; 95 1.5 16 3 0 15 0.1; orta=350, büyük=450; frappuccino kahve
Matcha latte; 60 3 7 2.3 0.2 6.5 0.1; orta=350
Chai tea latte; 70 2.3 11.5 1.6 0 11 0.1; orta=350
Sıcak çikolata; 85 3 12 2.8 0.8 11 0.1; 1 kupa=250
Salep; 95 3 15 2.6 0 13 0.1; 1 kupa=250; sahlep
Boza; 110 1 24 0.3 0.3 15 0; 1 bardak=250
Ayran; 37 1.8 2.6 2.1 0 2.6 0.4; 1 bardak=200, 1 kutu=300
Yayık ayranı; 33 1.5 2.3 1.9 0 2.3 0.4; 1 bardak=250; acik ayran
Kefir; 55 3.3 4.5 2.5 0 4.5 0.1; 1 bardak=200
Şalgam suyu; 6 0.2 1 0 0.2 0.4 1.5; 1 bardak=250
Ev yapımı limonata; 45 0 11.5 0 0 11 0; 1 bardak=250
Taze portakal suyu; 45 0.7 10.4 0.2 0.2 8.4 0; 1 bardak=200; meyve suyu
Elma suyu (%100); 46 0.1 11.3 0.1 0.2 9.6 0; 1 bardak=200; meyve suyu
Nar suyu; 54 0.2 13.1 0.3 0.1 12.7 0; 1 bardak=200; meyve suyu
Vişne nektarı; 55 0.2 13.5 0 0 13 0; 1 bardak=200; meyve suyu
Şeftali nektarı; 52 0.2 13 0 0 12 0; 1 bardak=200; meyve suyu
Karışık meyve suyu; 48 0.3 11.5 0.1 0.2 11 0; 1 bardak=200
Havuç suyu; 40 0.9 9.3 0.2 0.8 3.9 0.1; 1 bardak=200
Domates suyu; 17 0.9 3.5 0.3 0.4 2.6 0.6; 1 bardak=200
Meyveli smoothie; 60 1 13.5 0.3 1.5 11 0; 1 bardak=300
Muzlu sütlü smoothie; 75 2.8 12 1.8 0.8 10 0.1; 1 bardak=300
Protein smoothie; 80 6 10 1.8 1 7 0.1; 1 bardak=350
Çikolatalı milkshake; 120 3.3 18 4 0.5 17 0.2; 1 bardak=400
Kola; 42 0 10.6 0 0 10.6 0; 1 kutu=330, 1 şişe=500, 1 bardak=200; cola gazli icecek
Şekersiz kola; 0.3 0 0 0 0 0 0; 1 kutu=330; cola zero diyet light
Gazoz; 40 0 10 0 0 10 0; 1 şişe=250; gazli icecek
Meyveli soda; 25 0 6 0 0 6 0; 1 şişe=200
Tonik; 34 0 8.8 0 0 8.8 0; 1 kutu=250
Buzlu çay; 30 0 7.3 0 0 7.2 0; 1 kutu=330; soguk cay ice tea
Enerji içeceği; 45 0 11 0 0 11 0.1; 1 kutu=250; energy
Şekersiz enerji içeceği; 3 0 0.5 0 0 0 0.1; 1 kutu=250; energy
Sporcu içeceği; 25 0 6 0 0 6 0.1; 1 şişe=500; izotonik
Hindistan cevizi suyu; 19 0.7 3.7 0.2 1.1 2.6 0.1; 1 kutu=330
Badem sütü (şekersiz); 15 0.5 0.3 1.2 0.3 0 0.1; 1 bardak=200
Yulaf sütü; 45 1 6.5 1.5 0.8 3.5 0.1; 1 bardak=200
Soya sütü; 40 3 3 1.8 0.5 2.5 0.1; 1 bardak=200
Çikolatalı süt; 70 3.2 10 1.9 0.5 9.5 0.1; 1 kutu=200
Muzlu süt; 75 3 11.5 1.9 0 11 0.1; 1 kutu=200
Hoşaf; 60 0.3 15 0.1 0.5 14 0; 1 kase=200; komposto
Demirhindi şerbeti; 50 0 12.5 0 0 12 0; 1 bardak=200
Bubble tea; 80 0.5 17 1.2 0.2 14 0; 1 bardak=500

# alkol ml
Bira; 43 0.5 3.6 0 0 0 0; 1 şişe=330, 1 kutu=500, 1 bardak=400
Light bira; 29 0.2 1.3 0 0 0 0; 1 şişe=330
Alkolsüz bira; 22 0.3 5 0 0 3 0; 1 şişe=330
Buğday birası; 48 0.5 4.3 0 0 0 0; 1 bardak=500
IPA bira; 55 0.6 4.5 0 0 0 0; 1 şişe=330
Siyah bira; 50 0.5 4.5 0 0 0 0; 1 şişe=330; stout
Kırmızı şarap; 85 0.1 2.6 0 0 0.6 0; 1 kadeh=150
Beyaz şarap; 82 0.1 2.6 0 0 1 0; 1 kadeh=150
Roze şarap; 80 0.1 3 0 0 1.5 0; 1 kadeh=150
Köpüklü şarap; 80 0.2 1.5 0 0 1 0; 1 kadeh=120; sampanya prosecco
Rakı; 250 0 0 0 0 0 0; 1 tek=40, 1 duble=80
Votka; 231 0 0 0 0 0 0; 1 shot=40
Viski; 233 0 0 0 0 0 0; 1 shot=40
Cin; 231 0 0 0 0 0 0; 1 shot=40; gin
Tekila; 223 0 0 0 0 0 0; 1 shot=40
Rom; 231 0 0 0 0 0 0; 1 shot=40
Konyak; 231 0 0 0 0 0 0; 1 shot=40; brendi
Kremalı likör; 327 3 25 13.6 0 20 0.1; 1 kadeh=50
Elma şarabı; 50 0 5 0 0 4 0; 1 şişe=330; cider
Mojito; 80 0 9 0 0 8 0; 1 bardak=250; kokteyl
Margarita; 160 0.1 11 0 0 10 0; 1 kadeh=150; kokteyl
Piña colada; 175 0.4 22 1.9 0.2 20 0; 1 bardak=250; kokteyl
Cin tonik; 70 0 5 0 0 5 0; 1 bardak=250; kokteyl gin
Sangria; 85 0.1 9 0 0 8 0; 1 bardak=250
Aperol spritz; 75 0 6 0 0 6 0; 1 bardak=250; kokteyl

# takviye
Whey protein tozu; 380 78 6 5.5 0 4 0.5; 1 ölçek=30; protein tozu
Whey izolat; 370 88 2 1 0 1 0.4; 1 ölçek=30; protein tozu
Kazein protein; 360 78 8 2 1 2 0.5; 1 ölçek=30; protein tozu
Bitkisel protein tozu; 380 75 7 6.5 2 1 1.5; 1 ölçek=30; vegan bezelye
Mass gainer; 380 15 75 2.5 1 12 0.3; 1 ölçek=100; kilo aldirici
Kreatin monohidrat; 0 0 0 0 0 0 0; 1 ölçek=5; kreatin
BCAA tozu; 380 90 2 0.5 0 0 0.1; 1 ölçek=7
Kolajen tozu; 360 90 0 0 0 0 0.5; 1 ölçek=10; kollajen
Protein bar; 360 30 35 11.5 5 5 0.6; 1 adet=55
Çikolatalı whey protein bar; 380 32 33 13 4 6 0.6; 1 adet=60; protein bar
Protein puding; 80 10 6 1.7 0 4 0.2; 1 kase=200
Protein içeceği (hazır); 60 10 4 0.6 0 3.5 0.2; 1 şişe=330; ml
Enerji jeli; 260 0 65 0 0 30 0.3; 1 paket=40; jel
Omega-3 kapsül; 900 0 0 100 0 0 0; 1 kapsül=1; balik yagi
Multivitamin; 0 0 0 0 0 0 0; 1 tablet=1; vitamin
Elektrolit tableti; 0 0 0 0 0 0 30; 1 tablet=4
Proteinli yulaf ezmesi; 380 25 50 7.5 6 2 0.2; 1 kase=50
Protein kurabiye; 400 25 40 15 5 15 0.8; 1 adet=75
Protein cips; 410 40 30 14 3 2 2; 1 paket=30
`;
