import { View } from "react-native";
import { Text } from "../base/Text";

interface TestimonialProps {
  name: string;
  result: string;
  quote: string;
}

export function SocialProof({ className = "" }: { className?: string }) {
  const testimonials: TestimonialProps[] = [
    {
      name: "Alex M.",
      result: "Increased win rate by 15%",
      quote: "The structured approach helped me plug leaks I didn't even know I had. The interactive practice is game-changing.",
    },
    {
      name: "Sarah K.",
      result: "Finally profitable at $1/$2",
      quote: "I'd watched countless videos but never improved. The decision-based training actually made the concepts stick.",
    },
    {
      name: "Mike R.",
      result: "Confidence at higher stakes",
      quote: "The boot camp curriculum gave me a solid foundation. I'm now playing $2/$5 with confidence.",
    },
  ];

  return (
    <View className={`space-y-6 ${className}`}>
      <Text variant="h2" className="text-2xl font-bold text-white text-center mb-6">
        What Players Are Saying
      </Text>
      
      {testimonials.map((testimonial, index) => (
        <TestimonialCard
          key={index}
          name={testimonial.name}
          result={testimonial.result}
          quote={testimonial.quote}
        />
      ))}
      
      <View className="bg-gray-800 rounded-lg p-4 mt-6">
        <Text variant="body" className="text-center text-white font-semibold mb-2">
          Join 1,000+ players improving their game
        </Text>
        <Text variant="caption" className="text-center text-gray-400">
          Structured training that actually works
        </Text>
      </View>
    </View>
  );
}

function TestimonialCard({ name, result, quote }: TestimonialProps) {
  return (
    <View className="bg-gray-800 rounded-lg p-4">
      <Text variant="body" className="text-gray-300 italic mb-3">
        "{quote}"
      </Text>
      <View className="flex-row justify-between items-center">
        <Text variant="caption" className="text-white font-semibold">
          {name}
        </Text>
        <Text variant="caption" className="text-green-400">
          {result}
        </Text>
      </View>
    </View>
  );
}
