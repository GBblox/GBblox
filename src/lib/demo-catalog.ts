import type { Condition, Inclusion, ItemType, Status } from "./types";

export type DemoLot = {
  itemType: ItemType;
  setNum: string;
  name: string;
  category: string;
  subCategory: string | null;
  year: number;
  location: string;
  condition: Condition;
  instructions: Inclusion;
  box: Inclusion;
  qty: number;
  price: number;
  status: Status;
  notes: string;
};

export function demoImageUrl(lot: DemoLot): string {
  if (lot.itemType === "minifig") {
    return `https://img.bricklink.com/ItemImage/MN/0/${encodeURIComponent(lot.setNum)}.png`;
  }
  const no = lot.setNum.includes("-") ? lot.setNum : `${lot.setNum}-1`;
  return `https://img.bricklink.com/ItemImage/SN/0/${encodeURIComponent(no)}.png`;
}

export const DEMO_LOTS: DemoLot[] = [
  { itemType: "set", setNum: "75192-1", name: "Millennium Falcon", category: "Star Wars", subCategory: "Ultimate Collector Series", year: 2017, location: "A-12", condition: "used_complete", instructions: "yes", box: "yes", qty: 1, price: 650, status: "complete", notes: "UCS Falcon, boxed" },
  { itemType: "set", setNum: "75159-1", name: "Death Star", category: "Star Wars", subCategory: "Ultimate Collector Series", year: 2016, location: "A-12", condition: "used_complete", instructions: "yes", box: "yes", qty: 1, price: 520, status: "complete", notes: "" },
  { itemType: "set", setNum: "75313-1", name: "AT-AT", category: "Star Wars", subCategory: "Ultimate Collector Series", year: 2021, location: "A-13", condition: "new_sealed", instructions: "yes", box: "yes", qty: 1, price: 780, status: "complete", notes: "Sealed UCS" },
  { itemType: "set", setNum: "75331-1", name: "The Razor Crest", category: "Star Wars", subCategory: "Ultimate Collector Series", year: 2022, location: "A-13", condition: "used_complete", instructions: "yes", box: "no", qty: 1, price: 430, status: "complete", notes: "No box" },
  { itemType: "set", setNum: "10294-1", name: "Titanic", category: "Icons", subCategory: "Vehicles", year: 2021, location: "LOFT", condition: "used_complete", instructions: "yes", box: "yes", qty: 1, price: 540, status: "complete", notes: "" },
  { itemType: "set", setNum: "10316-1", name: "Rivendell", category: "Icons", subCategory: "The Lord of the Rings", year: 2023, location: "LOFT", condition: "new_opened", instructions: "yes", box: "yes", qty: 1, price: 420, status: "complete", notes: "Built once" },
  { itemType: "set", setNum: "10305-1", name: "Lion Knights' Castle", category: "Icons", subCategory: "Castle", year: 2022, location: "B-01", condition: "used_complete", instructions: "yes", box: "yes", qty: 1, price: 310, status: "complete", notes: "" },
  { itemType: "set", setNum: "71043-1", name: "Hogwarts Castle", category: "Harry Potter", subCategory: "Hogwarts", year: 2018, location: "B-01", condition: "used_complete", instructions: "yes", box: "yes", qty: 1, price: 380, status: "complete", notes: "" },
  { itemType: "set", setNum: "76419-1", name: "Hogwarts Castle and Grounds", category: "Harry Potter", subCategory: "Hogwarts", year: 2023, location: "B-02", condition: "new_sealed", instructions: "yes", box: "yes", qty: 1, price: 140, status: "complete", notes: "" },
  { itemType: "set", setNum: "75978-1", name: "Diagon Alley", category: "Harry Potter", subCategory: "Diagon Alley", year: 2020, location: "B-02", condition: "used_complete", instructions: "yes", box: "yes", qty: 1, price: 280, status: "complete", notes: "" },
  { itemType: "set", setNum: "10307-1", name: "Eiffel Tower", category: "Icons", subCategory: "Landmarks", year: 2022, location: "C-10", condition: "used_complete", instructions: "yes", box: "yes", qty: 1, price: 460, status: "complete", notes: "" },
  { itemType: "set", setNum: "21061-1", name: "Notre-Dame de Paris", category: "Architecture", subCategory: "Landmarks", year: 2024, location: "C-10", condition: "new_sealed", instructions: "yes", box: "yes", qty: 1, price: 200, status: "complete", notes: "" },
  { itemType: "set", setNum: "21056-1", name: "Taj Mahal", category: "Architecture", subCategory: "Landmarks", year: 2021, location: "C-10", condition: "used_complete", instructions: "yes", box: "yes", qty: 1, price: 95, status: "complete", notes: "" },
  { itemType: "set", setNum: "21058-1", name: "Great Pyramid of Giza", category: "Architecture", subCategory: "Landmarks", year: 2022, location: "C-10", condition: "used_complete", instructions: "yes", box: "no", qty: 1, price: 110, status: "complete", notes: "" },
  { itemType: "set", setNum: "10295-1", name: "Porsche 911", category: "Icons", subCategory: "Vehicles", year: 2021, location: "A-14", condition: "used_complete", instructions: "yes", box: "yes", qty: 1, price: 130, status: "complete", notes: "" },
  { itemType: "set", setNum: "42115-1", name: "Lamborghini Sián FKP 37", category: "Technic", subCategory: "Cars", year: 2020, location: "A-14", condition: "used_complete", instructions: "yes", box: "yes", qty: 1, price: 280, status: "complete", notes: "" },
  { itemType: "set", setNum: "42083-1", name: "Bugatti Chiron", category: "Technic", subCategory: "Cars", year: 2018, location: "A-14", condition: "used_complete", instructions: "yes", box: "yes", qty: 1, price: 240, status: "complete", notes: "" },
  { itemType: "set", setNum: "42143-1", name: "Ferrari Daytona SP3", category: "Technic", subCategory: "Cars", year: 2022, location: "A-14", condition: "new_opened", instructions: "yes", box: "yes", qty: 1, price: 320, status: "complete", notes: "" },
  { itemType: "set", setNum: "10300-1", name: "Back to the Future Time Machine", category: "Icons", subCategory: "Vehicles", year: 2022, location: "DESK", condition: "used_complete", instructions: "yes", box: "yes", qty: 1, price: 150, status: "complete", notes: "" },
  { itemType: "set", setNum: "10298-1", name: "Vespa 125", category: "Icons", subCategory: "Vehicles", year: 2022, location: "DESK", condition: "used_complete", instructions: "yes", box: "yes", qty: 1, price: 80, status: "complete", notes: "" },
  { itemType: "set", setNum: "21318-1", name: "Tree House", category: "Ideas", subCategory: "Buildings", year: 2019, location: "B-01", condition: "used_complete", instructions: "yes", box: "yes", qty: 1, price: 160, status: "complete", notes: "" },
  { itemType: "set", setNum: "21325-1", name: "Medieval Blacksmith", category: "Ideas", subCategory: "Castle", year: 2021, location: "B-01", condition: "used_complete", instructions: "yes", box: "yes", qty: 1, price: 140, status: "complete", notes: "" },
  { itemType: "set", setNum: "10281-1", name: "Bonsai Tree", category: "Botanical", subCategory: "Plants", year: 2021, location: "DESK", condition: "new_sealed", instructions: "yes", box: "yes", qty: 2, price: 45, status: "complete", notes: "Two sealed" },
  { itemType: "set", setNum: "10280-1", name: "Flower Bouquet", category: "Botanical", subCategory: "Plants", year: 2021, location: "DESK", condition: "used_complete", instructions: "yes", box: "no", qty: 1, price: 40, status: "complete", notes: "" },
  { itemType: "set", setNum: "10309-1", name: "Succulents", category: "Botanical", subCategory: "Plants", year: 2022, location: "DESK", condition: "used_complete", instructions: "yes", box: "yes", qty: 1, price: 38, status: "complete", notes: "" },
  { itemType: "set", setNum: "71374-1", name: "Nintendo Entertainment System", category: "Super Mario", subCategory: "Nintendo", year: 2020, location: "C-10", condition: "used_complete", instructions: "yes", box: "yes", qty: 1, price: 180, status: "complete", notes: "" },
  { itemType: "set", setNum: "21327-1", name: "Typewriter", category: "Ideas", subCategory: "Other", year: 2021, location: "C-10", condition: "used_complete", instructions: "yes", box: "yes", qty: 1, price: 170, status: "complete", notes: "" },
  { itemType: "set", setNum: "21333-1", name: "Vincent van Gogh — The Starry Night", category: "Ideas", subCategory: "Art", year: 2022, location: "C-10", condition: "new_sealed", instructions: "yes", box: "yes", qty: 1, price: 160, status: "complete", notes: "" },
  { itemType: "set", setNum: "10278-1", name: "Police Station", category: "Modular Buildings", subCategory: "Modular", year: 2021, location: "B-02", condition: "used_complete", instructions: "yes", box: "yes", qty: 1, price: 150, status: "complete", notes: "" },
  { itemType: "set", setNum: "10264-1", name: "Corner Garage", category: "Modular Buildings", subCategory: "Modular", year: 2019, location: "B-02", condition: "used_complete", instructions: "yes", box: "yes", qty: 1, price: 190, status: "sold", notes: "Sold locally" },
  { itemType: "set", setNum: "10270-1", name: "Bookshop", category: "Modular Buildings", subCategory: "Modular", year: 2020, location: "B-02", condition: "used_complete", instructions: "yes", box: "yes", qty: 1, price: 160, status: "sold", notes: "" },
  { itemType: "set", setNum: "10255-1", name: "Assembly Square", category: "Modular Buildings", subCategory: "Modular", year: 2017, location: "B-02", condition: "used_complete", instructions: "yes", box: "no", qty: 1, price: 220, status: "sold", notes: "" },
  { itemType: "set", setNum: "42154-1", name: "2022 Ford GT", category: "Technic", subCategory: "Cars", year: 2023, location: "A-14", condition: "used_incomplete", instructions: "yes", box: "no", qty: 1, price: 85, status: "for_sale", notes: "Missing a few pins" },
  { itemType: "set", setNum: "75192-1", name: "Millennium Falcon (spare)", category: "Star Wars", subCategory: "Ultimate Collector Series", year: 2017, location: "LOFT", condition: "used_parts", instructions: "no", box: "no", qty: 1, price: 180, status: "for_sale", notes: "Parts lot, no figs" },
  { itemType: "set", setNum: "71741-1", name: "NINJAGO City Gardens", category: "Ninjago", subCategory: "NINJAGO City", year: 2021, location: "A-13", condition: "used_incomplete", instructions: "yes", box: "yes", qty: 1, price: 210, status: "for_sale", notes: "A few plants missing" },
  { itemType: "set", setNum: "10497-1", name: "Galaxy Explorer", category: "Icons", subCategory: "Space", year: 2022, location: "A-12", condition: "used_incomplete", instructions: "no", box: "no", qty: 1, price: 70, status: "for_sale", notes: "Classic space, no box" },
  { itemType: "set", setNum: "31203-1", name: "World Map", category: "Art", subCategory: "Mosaics", year: 2021, location: "LOFT", condition: "used_parts", instructions: "yes", box: "no", qty: 1, price: 90, status: "for_sale", notes: "Tiles bagged" },
  { itemType: "set", setNum: "10326-1", name: "Natural History Museum", category: "Icons", subCategory: "Modular", year: 2024, location: "B-01", condition: "new_sealed", instructions: "yes", box: "yes", qty: 1, price: 260, status: "sold", notes: "Awaiting postage" },
  { itemType: "set", setNum: "10332-1", name: "Medieval Town Square", category: "Icons", subCategory: "Castle", year: 2024, location: "B-01", condition: "used_complete", instructions: "yes", box: "yes", qty: 1, price: 200, status: "sold", notes: "" },
  { itemType: "minifig", setNum: "sw0001", name: "Battle Droid", category: "Star Wars", subCategory: "Episode I", year: 1999, location: "BIN-03", condition: "used_complete", instructions: "na", box: "na", qty: 6, price: 3.5, status: "for_sale", notes: "" },
  { itemType: "minifig", setNum: "sw0002", name: "Stormtrooper", category: "Star Wars", subCategory: "Classic", year: 2001, location: "BIN-03", condition: "used_complete", instructions: "na", box: "na", qty: 4, price: 12, status: "for_sale", notes: "" },
  { itemType: "minifig", setNum: "sw0468", name: "Darth Vader", category: "Star Wars", subCategory: "Sith", year: 2013, location: "BIN-03", condition: "used_complete", instructions: "na", box: "na", qty: 1, price: 18, status: "for_sale", notes: "" },
  { itemType: "minifig", setNum: "sw0105", name: "Boba Fett", category: "Star Wars", subCategory: "Bounty Hunters", year: 2006, location: "BIN-04", condition: "used_complete", instructions: "na", box: "na", qty: 1, price: 45, status: "for_sale", notes: "" },
  { itemType: "minifig", setNum: "sw1088", name: "Grogu", category: "Star Wars", subCategory: "The Mandalorian", year: 2020, location: "BIN-04", condition: "used_complete", instructions: "na", box: "na", qty: 2, price: 8, status: "for_sale", notes: "" },
  { itemType: "minifig", setNum: "sw1070", name: "Yuletide Squadron Pilot", category: "Star Wars", subCategory: "Advent", year: 2019, location: "BIN-04", condition: "used_complete", instructions: "na", box: "na", qty: 1, price: 9, status: "for_sale", notes: "" },
  { itemType: "minifig", setNum: "hp001", name: "Harry Potter", category: "Harry Potter", subCategory: "Hogwarts", year: 2001, location: "BIN-03", condition: "used_complete", instructions: "na", box: "na", qty: 1, price: 22, status: "for_sale", notes: "" },
  { itemType: "minifig", setNum: "hp002", name: "Hermione Granger", category: "Harry Potter", subCategory: "Hogwarts", year: 2001, location: "BIN-03", condition: "used_complete", instructions: "na", box: "na", qty: 1, price: 20, status: "for_sale", notes: "" },
  { itemType: "minifig", setNum: "sw0003", name: "Princess Leia", category: "Star Wars", subCategory: "Classic", year: 2000, location: "BIN-04", condition: "used_complete", instructions: "na", box: "na", qty: 1, price: 35, status: "sold", notes: "" },
  { itemType: "minifig", setNum: "cas256", name: "Forestman", category: "Castle", subCategory: "Forestmen", year: 2013, location: "BIN-04", condition: "used_complete", instructions: "na", box: "na", qty: 3, price: 7, status: "sold", notes: "" },
  { itemType: "minifig", setNum: "sw0467", name: "Scout Trooper", category: "Star Wars", subCategory: "Classic", year: 2013, location: "BIN-03", condition: "used_complete", instructions: "na", box: "na", qty: 2, price: 14, status: "sold", notes: "" },
];
