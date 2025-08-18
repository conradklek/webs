import Card from "./card.js";
import CardHeader from "./card-header.js";
import CardTitle from "./card-title.js";
import CardDescription from "./card-description.js";
import CardContent from "./card-content.js";
import CardFooter from "./card-footer.js";

export default {
  ...Card,
  name: "Card",
  components: {
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    CardFooter,
  },
};
