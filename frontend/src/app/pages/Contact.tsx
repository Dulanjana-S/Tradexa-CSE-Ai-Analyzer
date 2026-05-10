import { useState } from "react";
import { Mail, MessageSquare, Send, Phone, MapPin, Globe, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Alert, AlertDescription } from "../components/ui/alert";
import { contactApi } from "../../lib/api/services";

export function Contact() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await contactApi.submit(formData);
      setIsSuccess(true);
      setFormData({ name: "", email: "", subject: "", message: "" });
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again later.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const contactInfo = [
    {
      icon: Mail,
      title: "Email Us",
      description: "Our team typically responds within 24 hours.",
      value: "support@tradexalk.com.lk",
      link: "mailto:support@tradexalk.com.lk"
    },
    {
      icon: Phone,
      title: "Call Us",
      description: "Mon-Fri from 9am to 6pm SLST.",
      value: "+94 11 234 5678",
      link: "tel:+94112345678"
    },
    {
      icon: MapPin,
      title: "Visit Us",
      description: "Colombo, Sri Lanka",
      value: "Colombo, Sri Lanka",
      link: "https://maps.google.com"
    }
  ];

  return (
    <div className="container mx-auto px-4 py-12 max-w-7xl">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold text-[var(--color-text-primary)] mb-4">
          Get in <span className="text-emerald-500">Touch</span>
        </h1>
        <p className="text-[var(--color-text-secondary)] max-w-2xl mx-auto text-lg">
          Have questions about TradexaLK or need assistance with your portfolio? 
          Our team of experts is here to help you navigate the Sri Lankan market.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Contact Info Sidebar */}
        <div className="space-y-6">
          {contactInfo.map((item, idx) => (
            <Card key={idx} className="border-[var(--color-border)] bg-[var(--color-bg-secondary)]/50 backdrop-blur-sm hover:border-emerald-500/30 transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <item.icon className="w-6 h-6 text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--color-text-primary)] mb-1">{item.title}</h3>
                    <p className="text-sm text-[var(--color-text-tertiary)] mb-2">{item.description}</p>
                    <a 
                      href={item.link} 
                      className="text-emerald-500 hover:text-emerald-400 font-medium transition-colors"
                      target={item.icon === MapPin ? "_blank" : undefined}
                      rel={item.icon === MapPin ? "noopener noreferrer" : undefined}
                    >
                      {item.value}
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Support Hours Card */}
          <Card className="border-[var(--color-border)] bg-emerald-500/5 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Globe className="w-5 h-5 text-emerald-500" />
                <h3 className="font-semibold text-[var(--color-text-primary)]">Support Hours</h3>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--color-text-tertiary)]">Monday - Friday</span>
                  <span className="text-[var(--color-text-secondary)] font-medium">9:00 AM - 6:00 PM</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--color-text-tertiary)]">Saturday</span>
                  <span className="text-[var(--color-text-secondary)] font-medium">9:00 AM - 1:00 PM</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--color-text-tertiary)]">Sunday</span>
                  <span className="text-emerald-500 font-medium">Closed</span>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Contact Form */}
        <div className="lg:col-span-2">
          <Card className="border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-xl overflow-hidden">
            <div className="h-2 bg-gradient-to-r from-emerald-600 to-cyan-600" />
            <CardHeader>
              <CardTitle className="text-2xl text-[var(--color-text-primary)] flex items-center gap-2">
                <MessageSquare className="w-6 h-6 text-emerald-500" />
                Send us a Message
              </CardTitle>
              <CardDescription className="text-[var(--color-text-secondary)]">
                Fill out the form below and we'll get back to you as soon as possible.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isSuccess ? (
                <div className="py-12 text-center animate-in fade-in zoom-in duration-500">
                  <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                  </div>
                  <h3 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">Message Sent!</h3>
                  <p className="text-[var(--color-text-secondary)] mb-8">
                    Thank you for reaching out. We have received your message and will get back to you shortly.
                  </p>
                  <Button 
                    variant="outline" 
                    onClick={() => setIsSuccess(false)}
                    className="border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"
                  >
                    Send another message
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-sm font-medium text-[var(--color-text-primary)]">
                        Full Name
                      </Label>
                      <Input
                        id="name"
                        placeholder="Your Name"
                        required
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                        className="bg-[var(--color-bg-primary)] border-[var(--color-border)] focus:ring-emerald-500/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-sm font-medium text-[var(--color-text-primary)]">
                        Email Address
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="You@example.com"
                        required
                        value={formData.email}
                        onChange={e => setFormData({...formData, email: e.target.value})}
                        className="bg-[var(--color-bg-primary)] border-[var(--color-border)] focus:ring-emerald-500/50"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subject" className="text-sm font-medium text-[var(--color-text-primary)]">
                      Subject
                    </Label>
                    <Input
                      id="subject"
                      placeholder="How can we help?"
                      required
                      value={formData.subject}
                      onChange={e => setFormData({...formData, subject: e.target.value})}
                      className="bg-[var(--color-bg-primary)] border-[var(--color-border)] focus:ring-emerald-500/50"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message" className="text-sm font-medium text-[var(--color-text-primary)]">
                      Your Message
                    </Label>
                    <Textarea
                      id="message"
                      placeholder="Tell us more about your inquiry..."
                      required
                      rows={6}
                      value={formData.message}
                      onChange={e => setFormData({...formData, message: e.target.value})}
                      className="bg-[var(--color-bg-primary)] border-[var(--color-border)] focus:ring-emerald-500/50 resize-none"
                    />
                  </div>

                  <Button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-6 transition-all duration-300"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5 mr-2" />
                        Send Message
                      </>
                    )}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Decorative Image Section */}
      <div className="mt-20 rounded-2xl overflow-hidden border border-[var(--color-border)] relative group">
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10" />
        <img 
          src="/contact_us_illustration.png" 
          alt="Contact Support" 
          className="w-full h-80 object-cover group-hover:scale-105 transition-transform duration-700"
        />
        <div className="absolute bottom-8 left-8 z-20">
          <h2 className="text-3xl font-bold text-white mb-2">Join our growing community</h2>
          <p className="text-emerald-100/80 max-w-md">
            Thousands of traders trust TradexaLK for their market analysis. 
            We're here to ensure your success in the stock market.
          </p>
        </div>
      </div>
    </div>
  );
}
